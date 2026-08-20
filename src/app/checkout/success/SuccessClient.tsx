"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { formatMoney } from "@/lib/money";
import { purchaseLabel } from "@/lib/photoTitle";
import { savePurchase } from "@/lib/purchases";

type OrderPhoto = { id: string; title: string; bibs: string[]; day: string; url: string };
type OrderResponse =
  | { status: "paid"; amountTotal: number; expiresAt: string; photos: OrderPhoto[] }
  | { status: "pending" };

// Card payments confirm instantly, but leave room for a slow round trip before
// giving up and telling the customer to check their email.
const MAX_ATTEMPTS = 5;
const RETRY_MS = 2000;

export default function SuccessClient({ sessionId }: { sessionId: string }) {
  const { clear } = useCart();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The basket must be emptied exactly once, and only after payment is
  // confirmed — clearing on mount would lose the basket on a failed lookup.
  const cleared = useRef(false);

  useEffect(() => {
    // A missing session id is knowable during render, so it's handled below
    // rather than by setting state from here.
    if (!sessionId) return;

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      try {
        const res = await fetch(`/api/order?session_id=${encodeURIComponent(sessionId)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Could not load your order.");
        }
        const body = (await res.json()) as OrderResponse;
        if (cancelled) return;

        setOrder(body);

        if (body.status === "paid") {
          if (!cleared.current) {
            cleared.current = true;
            clear();
            // Remembered so the customer can leave this page and still find
            // their downloads later under "My photos".
            savePurchase(sessionId);
          }
          return;
        }

        if (++attempts < MAX_ATTEMPTS) setTimeout(poll, RETRY_MS);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId, clear]);

  const problem = sessionId ? error : "No order reference in the link.";

  if (problem) {
    return (
      <Shell title="We couldn't find that order">
        <p className="text-sm text-muted">{problem}</p>
        <p className="text-sm text-muted">
          If you were charged, your download links are also in your confirmation email.
          Otherwise get in touch at{" "}
          <a href="mailto:helen.kivimurd@gmail.com" className="text-blue hover:text-blue-hover">
            helen.kivimurd@gmail.com
          </a>
          .
        </p>
      </Shell>
    );
  }

  if (!order) {
    return (
      <Shell title="Confirming your payment">
        <p className="font-mono text-sm text-muted">One moment…</p>
      </Shell>
    );
  }

  if (order.status === "pending") {
    return (
      <Shell title="Payment is still processing">
        <p className="text-sm text-muted">
          Your bank hasn&apos;t confirmed the payment yet. This can take a few minutes — we&apos;ll
          email your download links the moment it clears. You can safely close this page.
        </p>
      </Shell>
    );
  }

  const expires = new Date(order.expiresAt).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-blue">Payment complete</p>
      <h1 className="mt-3 font-display text-4xl uppercase tracking-wide sm:text-5xl">
        Your photos are ready
      </h1>
      <p className="mt-3 text-sm text-muted">
        {order.photos.length} photo{order.photos.length === 1 ? "" : "s"} ·{" "}
        {formatMoney(order.amountTotal / 100)} paid. Full resolution, no watermark. We&apos;ve also
        emailed these links — they work until <strong className="text-ink">{expires}</strong>.
      </p>

      <ul className="mt-10 divide-y divide-card border-y border-card">
        {order.photos.map((photo) => (
          <li key={photo.id} className="flex items-center gap-4 py-4">
            <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded bg-card">
              <Image
                src={`/api/photo/thumb/${photo.id}`}
                alt={purchaseLabel(photo)}
                fill
                sizes="96px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {purchaseLabel(photo)}
              </p>
              <p className="font-mono text-xs text-muted">{photo.day}</p>
            </div>
            <a
              href={photo.url}
              className="shrink-0 rounded-full bg-blue px-5 py-2.5 font-mono text-xs uppercase tracking-wide text-white transition-colors hover:bg-blue-hover"
            >
              Download
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-6 rounded-md bg-card px-4 py-3 text-sm text-ink">
        You can leave this page safely — your downloads stay available under{" "}
        <Link href="/downloads" className="text-blue hover:text-blue-hover">
          My photos
        </Link>{" "}
        in the menu at the top of any page.
      </p>

      <p className="mt-4 text-xs text-muted">
        Save the files somewhere safe before the links expire. Trouble downloading? Email{" "}
        <a href="mailto:helen.kivimurd@gmail.com" className="text-blue hover:text-blue-hover">
          helen.kivimurd@gmail.com
        </a>
        .
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-full bg-ink px-6 py-3 font-mono text-sm uppercase tracking-wide text-white transition-colors hover:bg-ink/85"
        >
          Back to homepage
        </Link>
        <Link
          href="/gallery"
          className="rounded-full border border-ink px-6 py-3 font-mono text-sm uppercase tracking-wide transition-colors hover:bg-ink hover:text-white"
        >
          Browse more photos
        </Link>
      </div>
    </div>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-5 py-24 text-center sm:px-8">
      <h1 className="font-display text-4xl uppercase tracking-wide">{title}</h1>
      {children}
    </div>
  );
}
