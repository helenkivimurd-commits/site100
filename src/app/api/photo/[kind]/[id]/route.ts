import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// Watermarked previews and thumbnails are written at upload time into
// public/photos/. That works in dev, but `next start` only serves the files
// public/ contained when the site was BUILT — anything written afterwards is a
// 404. On a live server that means every photo uploaded after deployment shows
// a broken image until someone rebuilds, which is not a workable shop.
//
// Reading them through a route handler instead sidesteps that: handlers run per
// request and read from disk as it is now, not as it was at build time.
const ROOTS = {
  thumb: path.join(process.cwd(), "public", "photos", "thumb"),
  preview: path.join(process.cwd(), "public", "photos", "preview"),
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
