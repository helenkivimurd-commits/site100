import { formatMoney } from "./money";
import { downloadUrl, type Order } from "./orders";

// Resend's REST API directly rather than its SDK — it's two fields and a POST,
// and this keeps the dependency list to just `stripe`.
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function receiptHtml(order: Order, baseUrl: string): string {
  const links = order.photoIds
    .map((id) => {
      const url = downloadUrl(baseUrl, order.token, id);
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #edeef2;font-family:monospace;font-size:13px;color:#14162b">${id.toUpperCase()}</td><td style="padding:8px 0;border-bottom:1px solid #edeef2;text-align:right"><a href="${url}" style="color:#2e4bff;font-family:monospace;font-size:13px">Download</a></td></tr>`;
    })
    .join("");

  const expires = new Date(order.expiresAt).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `<div style="max-width:520px;margin:0 auto;font-family:-apple-system,Segoe UI,sans-serif;color:#14162b;font-size:15px;line-height:1.6">
<p style="margin:0 0 16px">Hi!</p>
<p style="margin:0 0 16px">Thank you — truly!</p>
<p style="margin:0 0 24px">You did something incredible out there, and it means a lot that you&rsquo;d let me be the one to capture it. Your photos are below, yours to keep forever. You earned it.</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 8px">${links}</table>
<p style="color:#5b5f73;font-size:13px;margin:0 0 24px">Full resolution, no watermark. These links work until <strong>${expires}</strong> &mdash; please save the files somewhere safe before then.</p>
<p style="margin:0 0 16px">Every purchase helps me chase a dream of my own, so thank you for being part of that.</p>
<p style="margin:0 0 24px">Tag me on Instagram: <a href="https://instagram.com/h_kivimurd" style="color:#2e4bff">@h_kivimurd</a> or Facebook: <a href="https://www.facebook.com/helenliiskivimurd/" style="color:#2e4bff">@Helen Liis Kivimurd</a> if you share them &mdash; I&rsquo;d love to see it.</p>
<p style="margin:0 0 32px">Helen Kivimurd</p>
<p style="color:#5b5f73;font-size:12px;margin:0;border-top:1px solid #edeef2;padding-top:16px">${formatMoney(order.amountTotal / 100)} for ${order.photoIds.length} photo${order.photoIds.length === 1 ? "" : "s"} &middot; Helen Kivimurd Photography</p>
</div>`;
}

// Never throws. A failed email must not fail the webhook — the customer can
// still download from the success page, and Stripe shouldn't retry a paid order.
export async function sendReceiptEmail(order: Order, baseUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  // The From address has to sit on a domain verified with Resend, which rules
  // out a gmail.com address. That address needs no mailbox of its own — but the
  // receipt invites a reply, so point replies at one that is actually read.
  const replyTo = process.env.EMAIL_REPLY_TO;

  if (!apiKey || !from) {
    console.warn("[email] RESEND_API_KEY or EMAIL_FROM not set — skipping receipt email.");
    return false;
  }
  if (!order.email) {
    console.warn(`[email] No email address on order ${order.sessionId} — skipping.`);
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [order.email],
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        subject: "Your race photos — Helen Kivimurd Photography",
        html: receiptHtml(order, baseUrl),
      }),
    });

    if (!res.ok) {
      console.error(`[email] Resend rejected the send (${res.status}):`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Could not reach Resend:", err);
    return false;
  }
}
