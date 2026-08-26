"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useCart, toCartItem } from "./CartProvider";
import { formatMoney } from "@/lib/money";
import { photoLabel } from "@/lib/photoTitle";
import type { Photo } from "@/lib/types";

export default function PhotoLightbox({
  photo,
  onClose,
  onPrev,
  onNext,
  isAdmin = false,
}: {
  photo: Photo;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** True only when the person browsing is signed in to /admin in this browser. */
  isAdmin?: boolean;
}) {
  const { has, add, remove } = useCart();
  const inCart = has(photo.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onPrev, onNext]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
      />

      <div className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-page shadow-2xl md:max-h-[88vh] md:flex-row">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-full bg-ink/60 p-2 text-white transition-colors hover:bg-ink"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="relative flex flex-1 items-center justify-center bg-ink">
          {/* Sized from the photo's own dimensions rather than a fixed height:
              a fixed container forces every landscape shot into thick black
              bars. Width-led sizing means the common case has none at all. */}
          <Image
            src={`/api/photo/preview/${photo.id}`}
            alt={photoLabel(photo)}
            width={photo.width}
            height={photo.height}
            sizes="(min-width: 768px) 65vw, 100vw"
            className="h-auto max-h-[86vh] w-full object-contain"
            priority
          />
          {onPrev && (
            <button
              onClick={onPrev}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-ink/50 p-2 text-white transition-colors hover:bg-ink/80"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-ink/50 p-2 text-white transition-colors hover:bg-ink/80"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
        </div>

        {/* Natural flow, not justify-between: pushing the price to the bottom
            of a tall panel left a large empty gap that read as unfinished. */}
        <div className="flex w-full flex-col gap-6 p-6 md:w-80 md:shrink-0 md:overflow-y-auto">
          <div>
            <dl className="space-y-2 font-mono text-xs text-muted">
              <div className="flex justify-between border-b border-card pb-2">
                <dt>Bib</dt>
                <dd className="text-ink">{photo.bibs.length ? photo.bibs.join(", ") : "—"}</dd>
              </div>
              <div className="flex justify-between border-b border-card pb-2">
                <dt>Discipline</dt>
                <dd className="text-ink">{photo.discipline}</dd>
              </div>
              <div className="flex justify-between border-b border-card pb-2">
                <dt>Day</dt>
                <dd className="text-ink">{photo.day}</dd>
              </div>
            </dl>
            {/* Only ever rendered for a signed-in admin, so buyers never see a
                filename. Recognising a face on the shop and knowing the number
                is wrong is useless if you then have to hunt the photo down;
                this carries its name straight to the search that finds it. */}
            {isAdmin && (
              <p className="mt-3 flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className="text-muted">{photo.title}</span>
                <a
                  href={`/admin?find=${encodeURIComponent(photo.id)}`}
                  className="shrink-0 text-blue hover:underline"
                >
                  Fix in admin &rarr;
                </a>
              </p>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-muted">Digital download</span>
              <span className="font-mono text-xl text-blue">{formatMoney(photo.price)}</span>
            </div>
            <button
              type="button"
              onClick={() => (inCart ? remove(photo.id) : add(toCartItem(photo)))}
              className={`w-full rounded-full py-3 font-mono text-sm uppercase tracking-wide transition-colors ${
                inCart
                  ? "bg-ink text-white hover:bg-ink/85"
                  : "bg-blue text-white hover:bg-blue-hover"
              }`}
            >
              {inCart ? "Added to basket" : "Add to basket"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
