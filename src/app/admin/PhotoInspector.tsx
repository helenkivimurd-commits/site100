"use client";

import { useEffect, useRef, useState } from "react";

export type InspectorPhoto = {
  id: string;
  title: string;
  bibsText: string;
  noBib: boolean;
};

export default function PhotoInspector({
  photo,
  position,
  total,
  onClose,
  onPrev,
  onNext,
  onChangeBibs,
  onSave,
}: {
  photo: InspectorPhoto;
  position: number;
  total: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onChangeBibs: (bibsText: string) => void;
  onSave: (bibsText: string, noBib: boolean) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Zoom/loading state resets per photo because the parent gives this
  // component a `key` of photo.id, so moving to another photo remounts it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Let arrow keys move the caret while typing a bib number.
      if (document.activeElement === inputRef.current) return;
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

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!zoomed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{photo.title}</p>
          <p className="font-mono text-xs text-white/60">
            {photo.id.toUpperCase()} · {position} of {total}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setZoomed((z) => !z)}
            className="rounded-full border border-white/25 px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors hover:border-white"
          >
            {zoomed ? "Fit" : "Zoom 2×"}
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-white/25 p-2 transition-colors hover:border-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {onPrev && (
          <button
            onClick={onPrev}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/25"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/25"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {loading && !failed && (
          <p className="absolute font-mono text-xs text-white/60">Loading full-size photo…</p>
        )}
        {failed && (
          <p className="absolute max-w-sm px-6 text-center font-mono text-xs text-white/70">
            Couldn&apos;t load the original for this photo — it may have been moved out of the
            Media folder. Showing nothing rather than a watermarked copy.
          </p>
        )}

        <div
          className="h-full w-full overflow-hidden"
          onMouseMove={handleMouseMove}
          onClick={() => setZoomed((z) => !z)}
        >
          {/* Plain <img>: this is an API-rendered original, and next/image would
              re-encode and downscale exactly the detail we're trying to read. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photos/original?id=${encodeURIComponent(photo.id)}`}
            alt={photo.title}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            style={{ transformOrigin: origin }}
            className={`h-full w-full object-contain transition-transform duration-150 ${
              zoomed ? "scale-[2] cursor-zoom-out" : "cursor-zoom-in"
            } ${loading || failed ? "opacity-0" : "opacity-100"}`}
          />
        </div>
      </div>

      {/* pl-20 keeps the controls clear of the Next.js dev-mode badge pinned bottom-left. */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-white/15 py-3 pl-20 pr-4">
        <label className="font-mono text-xs uppercase tracking-wide text-white/60">
          Bib number(s)
        </label>
        <input
          ref={inputRef}
          value={photo.bibsText}
          onChange={(e) => onChangeBibs(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSave(photo.bibsText, false);
              if (onNext) onNext();
            }
          }}
          disabled={photo.noBib}
          placeholder="e.g. 2037, 260"
          className="w-44 rounded-md border border-white/25 bg-white/10 px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-white/40 focus:border-white disabled:opacity-40"
        />
        <label className="flex items-center gap-1.5 font-mono text-xs text-white/60">
          <input
            type="checkbox"
            checked={photo.noBib}
            onChange={(e) => onSave(photo.bibsText, e.target.checked)}
          />
          No bib visible
        </label>
        <button
          onClick={() => {
            onSave(photo.bibsText, photo.noBib);
            if (onNext) onNext();
          }}
          className="rounded-full bg-blue px-5 py-2 font-mono text-xs uppercase tracking-wide text-white transition-colors hover:bg-blue-hover"
        >
          Save &amp; next
        </button>
        <span className="font-mono text-xs text-white/40">
          Enter saves · ← → moves · Esc closes
        </span>
      </div>
    </div>
  );
}
