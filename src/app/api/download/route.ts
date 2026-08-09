import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getOrderByToken, isExpired } from "@/lib/orders";
import { findOriginal } from "@/lib/originals";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
};

// Serves the full-resolution, unwatermarked original — the thing the customer
// actually paid for. Everything above the file read is an access check.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("token");
  const photoId = params.get("photo");

  if (!token || !photoId) {
    return NextResponse.json({ error: "token and photo are required" }, { status: 400 });
  }

  const order = await getOrderByToken(token);
  if (!order) {
    return NextResponse.json({ error: "This download link isn't valid." }, { status: 404 });
  }
  if (order.status !== "paid") {
    return NextResponse.json({ error: "This order hasn't been paid." }, { status: 403 });
  }
  // A valid token only unlocks the photos on that specific order.
  if (!order.photoIds.includes(photoId)) {
    return NextResponse.json({ error: "That photo isn't part of this order." }, { status: 403 });
  }
  if (isExpired(order)) {
    return NextResponse.json(
      { error: "This download link has expired. Get in touch and we'll reissue it." },
      { status: 410 }
    );
  }

  const original = await findOriginal(photoId);
  if (!original) {
    // Paid for, but the file isn't on disk — the photographer's problem to fix,
    // so make it loud rather than handing the customer a broken image.
    console.error(`[download] Paid photo ${photoId} has no original in Media/.`);
    return NextResponse.json(
      { error: "We couldn't find this file. Please contact us and we'll send it directly." },
      { status: 404 }
    );
  }

  const ext = path.extname(original).toLowerCase();
  const file = await fs.readFile(original);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="h_kivimurd-${photoId}${ext}"`,
      "Content-Length": String(file.length),
      "Cache-Control": "private, no-store",
    },
  });
}
