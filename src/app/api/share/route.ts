import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/adminAuth";
import { createShareLink } from "@/lib/orders";
import { getPhotoMap } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Makes a download link for photos she wants to send to someone directly —
// the same link a buyer gets, so the file arrives full size and unwatermarked
// rather than squashed by whatever app it was sent through.
//
// This mints access to original files, so it is guarded twice: once here, and
// once in proxy.ts, which will not route the request at all without the admin
// password. Losing one of those guards must not open the other.

const MAX_PHOTOS = 50;

export async function POST(request: Request) {
  const denied = await guardAdminRoute(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as {
    photoIds?: unknown;
    for?: unknown;
  } | null;

  const raw = Array.isArray(body?.photoIds) ? body.photoIds : null;
  if (!raw) {
    return NextResponse.json({ error: "photoIds is required." }, { status: 400 });
  }
  const asked = Array.from(new Set(raw.filter((id): id is string => typeof id === "string")));
  if (asked.length === 0) {
    return NextResponse.json({ error: "Pick at least one photo." }, { status: 400 });
  }
  if (asked.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `A link can hold at most ${MAX_PHOTOS} photos.` },
      { status: 400 }
    );
  }

  // Only photos that actually exist, checked here rather than trusted from the
  // browser, so a link can never be minted for something outside the catalogue.
  const catalogue = await getPhotoMap();
  const photoIds = asked.filter((id) => catalogue.has(id));
  if (photoIds.length === 0) {
    return NextResponse.json({ error: "None of those photos exist." }, { status: 400 });
  }

  const giftFor = typeof body?.for === "string" ? body.for.trim().slice(0, 80) : "";
  const order = await createShareLink(photoIds, giftFor || null);

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin;
  return NextResponse.json({
    url: `${base.replace(/\/$/, "")}/downloads?token=${order.token}`,
    photos: photoIds.length,
    skipped: asked.length - photoIds.length,
    expiresAt: order.expiresAt,
  });
}
