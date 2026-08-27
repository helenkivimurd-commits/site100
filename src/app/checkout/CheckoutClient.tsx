"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useCart } from "@/components/CartProvider";
import { formatMoney } from "@/lib/money";
import { purchaseLabel } from "@/lib/photoTitle";
import { bundleLabel, bundleSubLabel } from "@/lib/pricing";

export default function CheckoutClient() {
  const { items, subtotal, discount, total, bundleTier } = useCart();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Only ids go over the wire. The server looks up every price itself, so
      // a basket edited in localStorage can't change what gets charged.
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: items.map((i) => i.id), email }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        setError(body.error ?? "Could not start checkout. Please try again.");
        setSubmitting(false);
        return;
      }

      // Hand off to Stripe's hosted page. The basket is deliberately left alone
      // until payment succeeds, so backing out doesn't lose the selection.
      window.location.href = body.url;
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-5 py-24 text-center sm:px-8">
        <h1 className="font-display text-4xl uppercase tracking-wide">Your basket is empty</h1>
        <p className="text-sm text-muted">Find your bib number and add a few photos first.</p>
        <Link
          href="/#find"
          className="mt-2 rounded-full bg-blue px-6 py-3 font-mono text-sm uppercase tracking-wide text-white transition-colors hover:bg-blue-hover"
        >
          Find my photos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-4xl uppercase tracking-wide sm:text-5xl">Checkout</h1>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-muted">
              Where should we send your photos?
            </legend>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-ink/15 bg-page px-3 py-2.5 text-sm outline-none focus:border-blue"
                placeholder="jane@example.com"
              />
              <p className="text-xs text-muted">
                Your download links go here. You&apos;ll also get them on screen right after paying.
              </p>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-md bg-card p-5">
            <legend className="px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted">
              Payment
            </legend>
            <p className="text-sm text-ink">
              You&apos;ll be taken to Stripe to pay by card, Apple Pay or Google Pay, then brought
              straight back here to download.
            </p>
            <p className="text-xs text-muted">
              Card details are handled entirely by Stripe — they never touch this site.
            </p>
          </fieldset>

          {error && (
            <p className="rounded-md bg-magenta/10 px-4 py-3 text-sm text-magenta">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-blue py-3.5 font-mono text-sm uppercase tracking-wide text-white transition-colors hover:bg-blue-hover disabled:opacity-60"
          >
            {submitting ? "Taking you to Stripe…" : `Pay ${formatMoney(total)}`}
          </button>
        </form>

        <div className="h-fit rounded-md bg-card p-6">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Order summary
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {items.map((photo) => (
              <li key={photo.id} className="flex gap-3">
                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded bg-page">
                  <Image
                    src={`/api/photo/thumb/${photo.id}`}
                    alt={photo.bibs.length > 0 ? `Bib ${photo.bibs.join(", ")}` : photo.day}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-1 items-center justify-between gap-2">
                  <span className="text-sm leading-snug">
                    {purchaseLabel(photo)}
                  </span>
                  <span className="shrink-0 font-mono text-sm text-blue">
                    {formatMoney(photo.price)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 space-y-2 border-t border-ink/10 pt-4 text-sm">
            {bundleTier !== "none" && (
              <div className="mb-2 flex items-center justify-between rounded-md bg-ink px-3 py-2 text-xs text-white">
                <span className="font-mono uppercase tracking-wide">{bundleLabel(bundleTier)}</span>
                <span className="font-mono">{bundleSubLabel(bundleTier)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="font-mono">{formatMoney(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-muted">
                <span>Bundle discount</span>
                <span className="font-mono">-{formatMoney(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-medium">
              <span>Total</span>
              <span className="font-mono text-blue">{formatMoney(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
