import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getOrderBySession, markPaid, downloadUrl } from "@/lib/orders";
import { getPhoto } from "@/lib/catalog";

// Powers the success page. It asks Stripe directly rather than waiting for the
// webhook, so download links appear the instant the customer lands here even
// if the webhook is slow, retrying, or (in local dev) not running at all.
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const order = await getOrderBySession(sessionId);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  let paid = order.status === "paid";

  if (!paid) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      paid = session.payment_status === "paid";
      // Keep the local record honest. Email stays the webhook's job so there's
      // exactly one place that can send it.
      if (paid) await markPaid(sessionId);
    } catch (err) {
      console.error("[order] Could not verify session with Stripe:", err);
      return NextResponse.json({ error: "Could not verify payment" }, { status: 502 });
    }
  }

  if (!paid) {
    return NextResponse.json({ status: "pending" });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  return NextResponse.json(
    {
      status: "paid",
      amountTotal: order.amountTotal,
      expiresAt: order.expiresAt,
      photos: order.photoIds.map((id) => {
        const photo = getPhoto(id);
        return {
          id,
          // Included so the success and downloads pages can name a photo the
          // way the rest of the site does, instead of falling back to its id.
          title: photo?.title ?? "",
          bibs: photo?.bibs ?? [],
          day: photo?.day ?? "",
          url: downloadUrl(baseUrl, order.token, id),
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
