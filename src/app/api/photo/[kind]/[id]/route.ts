import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PREVIEW_DIR, THUMB_DIR } from "@/lib/storage";

// Watermarked previews and thumbnails are written at upload time and read back
// through this handler rather than served as static files. `next start` only
// serves what public/ held when the site was BUILT, so anything written
// afterwards would 404 until someone rebuilt — not a workable shop. Handlers
// run per request and read from disk as it is now.
//
// Where the files actually live is storage.ts's decision; on the server it is
// outside the git working tree so that a stray `git clean` cannot delete them.
const ROOTS = {
  thumb: THUMB_DIR,
  preview: PREVIEW_DIR,
} as const;

type Kind = keyof typeof ROOTS;

// These were served as `immutable` for a year, on the reasoning that a photo id
// never changes what it points at. Re-watermarking the whole catalogue broke
// that: every render was rewritten under its existing id, and browsers and
// Next's image optimiser both went on serving the old picture — the gallery
// showed the previous watermark while the file on disk had the new one.
//
// An hour of free reuse keeps repeat visits cheap; after that a cached copy is
// still shown instantly while being revalidated in the background, and the
// ETag makes that revalidation a 304 with no image body. A change to a render
// now reaches everyone on its own, without anyone clearing a cache.
const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=2592000";

// These are watermarked, deliberately public images — the same ones the gallery
// shows — so there is no access check here. The originals are the guarded
// thing, and they live in object storage behind /api/download.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;

  if (!(kind in ROOTS)) {
    return NextResponse.json({ error: "Unknown image kind." }, { status: 404 });
  }
  // Ids are reduced to [a-z0-9-] on upload by slugifyFilename. Re-checking here
  // means a crafted id can't walk out of the directory with dots or slashes.
  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "Bad image id." }, { status: 400 });
  }

  const file = path.join(ROOTS[kind as Kind], `${id}.jpg`);

  try {
    // The render's own mtime and size are the version. Re-watermarking rewrites
    // every file in place under the same id, so identity alone cannot say
    // whether a cached copy is still current — this can.
    const stat = await fs.stat(file);
    const etag = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;

    // A caller holding the current version gets a 304 and no body at all.
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE_CONTROL } });
    }

    const body = await fs.readFile(file);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(body.length),
        "Cache-Control": CACHE_CONTROL,
        ETag: etag,
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
}
