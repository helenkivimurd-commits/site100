import { NextResponse } from "next/server";
import path from "node:path";
import { getOrderByToken, isExpired } from "@/lib/orders";
import { findOriginal, originalDownloadUrl } from "@/lib/originals";

// Serves the full-resolution, unwatermarked original — the thing the customer
// actually paid for. Everything above the redirect is an access check.
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

  const key = await findOriginal(photoId);
  if (!key) {
    // Paid for, but the object isn't in the bucket — the photographer's problem
    // to fix, so make it loud rather than handing the customer a broken image.
    console.error(`[download] Paid photo ${photoId} has no original in object storage.`);
    return NextResponse.json(
      { error: "We couldn't find this file. Please contact us and we'll send it directly." },
      { status: 404 }
    );
  }

  const ext = path.extname(key).toLowerCase();
  const url = await originalDownloadUrl(key, `h_kivimurd-${photoId}${ext}`);

  // Hand the customer a short-lived link straight to the bucket instead of
  // streaming 60 MB back out through this server. The signed URL carries its
  // own expiry, and no-store keeps the redirect itself out of any cache, so a
  // shared link stops working rather than becoming a permanent free download.
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
