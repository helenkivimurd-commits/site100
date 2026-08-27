import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getPhotoMap } from "@/lib/catalog";
import type { Photo } from "@/lib/types";
import { pricePerPhotoAt } from "@/lib/pricing";
import { createPendingOrder } from "@/lib/orders";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { shopOpen } from "@/lib/shopOpen";

// Stripe caps a Checkout Session at 100 line items.
const MAX_PHOTOS = 100;

// Each call creates a Stripe session and writes an order record, so this is the
// one public endpoint where repeated hits cost real resources. Generous enough
// that a customer changing their mind several times never notices.
const MAX_CHECKOUTS = 15;
const CHECKOUT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  // Closed means closed: a basket kept open in a tab must not be able to buy
  // after the shop has shut.
  if (!shopOpen()) {
    return NextResponse.json({ error: "The shop is closed." }, { status: 403 });
  }

  const limit = rateLimit(clientKey(request, "checkout"), MAX_CHECKOUTS, CHECKOUT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    photoIds?: unknown;
    email?: unknown;
  } | null;

  const rawIds = Array.isArray(body?.photoIds) ? body.photoIds : null;
  if (!rawIds || rawIds.length === 0) {
    return NextResponse.json({ error: "No photos in the basket." }, { status: 400 });
  }

  // Deduplicate — the same photo twice would double-charge for one file.
  const photoIds = Array.from(new Set(rawIds.filter((id): id is string => typeof id === "string")));
  if (photoIds.length === 0) {
    return NextResponse.json({ error: "No valid photos in the basket." }, { status: 400 });
  }
  if (photoIds.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `That's more than ${MAX_PHOTOS} photos — please order in smaller batches.` },
      { status: 400 }
    );
  }

  // The client sends ids and nothing else. Every price below is looked up and
  // computed here, so a tampered basket in localStorage can't change what the
  // customer is charged.
  const photos: Photo[] = [];
  const missing: string[] = [];
  const catalogue = await getPhotoMap();
  for (const id of photoIds) {
    const photo = catalogue.get(id);
    if (photo) photos.push(photo);
    else missing.push(id);
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Some photos are no longer available: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  // Bundle tier is a function of how many photos are being bought, so the
  // discount is baked into each line's unit price rather than added after.
  const unitCents = Math.round(pricePerPhotoAt(photoIds.length) * 100);
  const email = typeof body?.email === "string" && body.email.trim() ? body.email.trim() : null;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: photos.map((photo) => ({
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: unitCents,
          product_data: {
            name:
              photo.bibs.length > 0
                ? `Race photo — bib ${photo.bibs.join(" / ")}`
                : `Race photo — ${photo.id.toUpperCase()}`,
            description: `${photo.event} · ${photo.day} · ${photo.discipline}`,
          },
        },
      })),
      ...(email ? { customer_email: email } : {}),
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
    }

    // Recorded before the redirect so the photo list is pinned server-side.
    // The webhook only flips this to paid — it never decides what was bought.
    await createPendingOrder(session.id, photoIds, unitCents * photoIds.length, email);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Could not create Stripe session:", err);
    const message =
      err instanceof Error && err.message.includes("STRIPE_SECRET_KEY")
        ? "Payments aren't configured yet — STRIPE_SECRET_KEY is missing from .env.local."
        : "Could not start checkout. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
