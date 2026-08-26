import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getOrderBySession, getOrderByToken, markPaid, downloadUrl } from "@/lib/orders";
import { getPhotoMap } from "@/lib/catalog";

// Powers the success page. It asks Stripe directly rather than waiting for the
// webhook, so download links appear the instant the customer lands here even
// if the webhook is slow, retrying, or (in local dev) not running at all.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sessionId = params.get("session_id");
  // A token identifies one order on its own, which is what a link sent to
  // somebody has to do: they were never at the checkout, so their browser
  // remembers nothing and there is no session id to ask about.
  const token = params.get("token");
  if (!sessionId && !token) {
    return NextResponse.json({ error: "session_id or token is required" }, { status: 400 });
  }

  const order = token ? await getOrderByToken(token) : await getOrderBySession(sessionId!);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  let paid = order.status === "paid";

  // Only a session id can be checked against Stripe. A token belonging to an
  // unpaid order simply is not ready, and asking Stripe about it is meaningless.
  if (!paid && sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId!);
      paid = session.payment_status === "paid";
      // Keep the local record honest. Email stays the webhook's job so there's
      // exactly one place that can send it.
      if (paid) await markPaid(sessionId!);
    } catch (err) {
      console.error("[order] Could not verify session with Stripe:", err);
      return NextResponse.json({ error: "Could not verify payment" }, { status: 502 });
    }
  }

  if (!paid) {
    return NextResponse.json({ status: "pending" });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  // Read once for the whole order rather than per photo id.
  const catalogue = await getPhotoMap();

  return NextResponse.json(
    {
      status: "paid",
      amountTotal: order.amountTotal,
      expiresAt: order.expiresAt,
      photos: order.photoIds.map((id) => {
        const photo = catalogue.get(id);
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
