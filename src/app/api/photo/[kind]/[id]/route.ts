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

// These are watermarked, deliberately public images — the same ones the gallery
// shows — so there is no access check here. The originals are the guarded
// thing, and they live in object storage behind /api/download.
export async function GET(
  _request: Request,
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

  try {
    const file = await fs.readFile(path.join(ROOTS[kind as Kind], `${id}.jpg`));
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(file.length),
        // Content for a given id never changes: a new upload gets a new id.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
}
