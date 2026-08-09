import { NextResponse } from "next/server";
import sharp from "sharp";
import { findOriginal } from "@/lib/originals";
import { guardAdminRoute } from "@/lib/adminAuth";

// Widest edge for the admin viewer. Big enough to read a bib number pinned to
// a moving runner, small enough to decode quickly on every click.
const VIEW_WIDTH = 2800;

// Admin only: this is the unwatermarked photo, downscaled but otherwise the
// thing /api/download charges for. src/proxy.ts blocks unauthenticated
// requests before they reach here; the guard below is the second lock.
export async function GET(request: Request) {
  const denied = await guardAdminRoute(request);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const original = await findOriginal(id);
  if (!original) {
    return NextResponse.json(
      { error: "No original found for this photo. It may have been moved out of Media/." },
      { status: 404 }
    );
  }

  const body = await sharp(original)
    .rotate()
    .resize({ width: VIEW_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
