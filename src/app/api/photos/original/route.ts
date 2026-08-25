import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { findOriginal, readOriginal } from "@/lib/originals";
import { guardAdminRoute } from "@/lib/adminAuth";
import { RENDERS_DIR } from "@/lib/storage";

// Two sizes. Tagging shows the smaller one, because most bibs are perfectly
// readable at that size and it arrives in a fraction of the time; pressing zoom
// asks for the larger, which is what a helmet sticker needs.
//
// Anything else is refused rather than resized on demand: the width is in a URL
// an admin controls, and an open-ended one would let a stray request make the
// server render a 30,000px JPEG.
const WIDTHS = { view: 1400, full: 2800 } as const;
type Size = keyof typeof WIDTHS;

// Resized frames are kept on disk. Fetching a 10MB original out of the bucket
// and resizing it took four and a half seconds, and it was being done again on
// every single view — tagging a photo meant waiting for work the server had
// already done. From the cache the same frame takes milliseconds, and because
// the tagging screen asks for the next few photos in advance, they are usually
// already here by the time they are wanted.
const CACHE_DIR = path.join(RENDERS_DIR, "work");

export async function GET(request: Request) {
  const denied = await guardAdminRoute(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  // Same guard as the public image route: ids are [a-z0-9-] on upload, so
  // anything else cannot name a file and must not be used to build a path.
  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "Bad image id." }, { status: 400 });
  }

  const size: Size = params.get("size") === "full" ? "full" : "view";
  const cacheFile = path.join(CACHE_DIR, `${id}-${size}.jpg`);

  const send = (body: Buffer) =>
    new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(body.length),
        // Private: this is the unwatermarked frame, so it may sit in the
        // photographer\'s own browser but nowhere shared.
        "Cache-Control": "private, max-age=86400",
      },
    });

  try {
    return send(await fs.readFile(cacheFile));
  } catch {
    // Not cached yet — fall through and make it.
  }

  const key = await findOriginal(id);
  if (!key) {
    return NextResponse.json(
      { error: "No original found for this photo. It may have been removed from the bucket." },
      { status: 404 }
    );
  }

  const body = await sharp(await readOriginal(key))
    .rotate()
    .resize({ width: WIDTHS[size], withoutEnlargement: true })
    .jpeg({ quality: size === "full" ? 88 : 82, mozjpeg: true })
    .toBuffer();

  // Written through a temp name so a half-written file is never served, and
  // failures here are ignored: a cache that cannot be written should slow the
  // next view down, not break this one.
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const tmp = `${cacheFile}.${process.pid}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, cacheFile);
  } catch {}

  return send(body);
}
