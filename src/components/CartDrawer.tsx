"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { useCart } from "./CartProvider";
import { formatMoney } from "@/lib/money";
import { bundleLabel, bundleSubLabel, BUNDLE_5_THRESHOLD, BUNDLE_10_THRESHOLD } from "@/lib/pricing";

export default function CartDrawer() {
  const { drawerOpen, closeDrawer, items, remove, subtotal, discount, total, bundleTier } =
    useCart();

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen, closeDrawer]);

  if (!drawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close basket"
        onClick={closeDrawer}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div className="relative flex h-full w-full max-w-md flex-col bg-page shadow-2xl">
        <div className="flex items-center justify-between border-b border-card px-6 py-5">
          <h2 className="font-display text-2xl uppercase tracking-wide">Your basket</h2>
          <button
            onClick={closeDrawer}
            aria-label="Close"
            className="rounded-full p-2 transition-colors hover:bg-card"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-display text-xl uppercase tracking-wide text-muted">
              Your basket is empty
            </p>
            <p className="max-w-xs text-sm text-muted">
              Search your bib number to find your race photos, then add the ones you want here.
            </p>
            <Link
              href="/#find"
              onClick={closeDrawer}
              className="mt-2 rounded-full bg-blue px-5 py-2.5 font-mono text-sm text-white transition-colors hover:bg-blue-hover"
            >
              Find my photos
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-6 py-4">
              {items.map((photo) => (
                <li key={photo.id} className="flex gap-3 border-b border-card py-4 first:pt-0">
                  <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md bg-card">
                    <Image
                      src={`/photos/thumb/${photo.id}.jpg`}
                      alt={photo.bibs.length > 0 ? `Bib ${photo.bibs.join(", ")}` : photo.day}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <p className="text-sm font-medium leading-snug">
                        {photo.bibs.length > 0 ? `Bib ${photo.bibs.join(" / ")}` : photo.id.toUpperCase()}
                      </p>
                      <p className="font-mono text-xs text-muted">{photo.day}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-blue">{formatMoney(photo.price)}</span>
                      <button
                        onClick={() => remove(photo.id)}
                        className="font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-ink"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-card px-6 py-5">
              {bundleTier === "none" && (
                <p className="mb-3 text-xs text-muted">
                  Add {BUNDLE_5_THRESHOLD - items.length} more for a bundle discount.
                </p>
              )}
              {bundleTier !== "none" && (
                <div className="mb-3 flex items-center justify-between rounded-md bg-ink px-3 py-2 text-xs text-white">
                  <span className="font-mono uppercase tracking-wide">{bundleLabel(bundleTier)}</span>
                  <span className="font-mono">{bundleSubLabel(bundleTier)}</span>
                </div>
              )}
              {bundleTier === "bundle5" && (
                <p className="mb-3 text-xs text-muted">
                  Add {BUNDLE_10_THRESHOLD - items.length} more for an even bigger discount.
                </p>
              )}
              <div className="flex items-center justify-between text-sm text-muted">
                <span>Subtotal</span>
                <span className="font-mono">{formatMoney(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="mt-1 flex items-center justify-between text-sm text-muted">
                  <span>Bundle discount</span>
                  <span className="font-mono">-{formatMoney(discount)}</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between text-base font-medium">
                <span>Total</span>
                <span className="font-mono text-blue">{formatMoney(total)}</span>
              </div>
              <Link
                href="/checkout"
                onClick={closeDrawer}
                className="mt-4 block w-full rounded-full bg-blue py-3 text-center font-mono text-sm text-white transition-colors hover:bg-blue-hover"
              >
                Checkout · {formatMoney(total)}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
