import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { markPaid, recordEmailSent } from "@/lib/orders";
import { sendReceiptEmail } from "@/lib/email";

// This is the only trustworthy "the customer actually paid" signal. The
// browser redirect to /checkout/success can be lost (closed tab, dead wifi),
// so fulfilment hangs off this, never off the success page.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set — refusing to trust this request.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Must be the raw body — parsing it first would change the bytes and break
  // the signature check.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(payload, signature, secret);
  } catch (err) {
    // Anyone can POST here; this is what stops them from faking a paid order.
    console.error("[webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    // Card payments are paid on completion, but bank-debit style methods can
    // complete while still unpaid — those arrive later as async_payment_succeeded.
    if (session.payment_status !== "paid") {
      console.log(`[webhook] Session ${session.id} completed but not yet paid — waiting.`);
      return NextResponse.json({ received: true });
    }

    const { order, alreadyPaid } = await markPaid(session.id);

    if (!order) {
      // Shouldn't happen — the order is written before the redirect. Log loudly
      // but still return 200, because retrying won't conjure the record up.
      console.error(`[webhook] Paid session ${session.id} has no matching order record.`);
      return NextResponse.json({ received: true });
    }

    // Stripe retries until it gets a 200, so this handler must be safe to run
    // twice. Re-sending the receipt on every retry is the thing to avoid.
    if (alreadyPaid) {
      console.log(`[webhook] Session ${session.id} already fulfilled — ignoring retry.`);
      return NextResponse.json({ received: true });
    }

    // Fall back to the address Stripe collected if none was typed on our form.
    const recipient = order.email ?? session.customer_details?.email ?? null;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const sent = await sendReceiptEmail({ ...order, email: recipient }, baseUrl);
    if (sent) await recordEmailSent(session.id);

    console.log(
      `[webhook] Fulfilled ${session.id}: ${order.photoIds.length} photo(s), email ${sent ? "sent" : "skipped"}.`
    );
  }

  return NextResponse.json({ received: true });
}
