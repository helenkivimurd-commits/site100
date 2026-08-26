"use client";

import { useEffect, useState } from "react";

// A sold photograph, clickable. The thumbnail is small enough to fit several
// orders on screen, which is too small to actually look at the picture — so
// clicking opens the full frame, unwatermarked, as she took it.
export default function SoldPhoto({
  id,
  title,
  caption,
  className = "h-14 w-20",
}: {
  id: string;
  title: string;
  caption?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // Escape closes it, and the page behind must not scroll while it is open —
  // otherwise dismissing it leaves you somewhere else entirely.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`View ${title} larger`}
        className={`${className} shrink-0 overflow-hidden rounded-sm transition-opacity hover:opacity-80`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/photo/thumb/${id}`} alt={title} className="h-full w-full object-cover" />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/90 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photos/original?id=${encodeURIComponent(id)}&size=view`}
            alt={title}
            className="max-h-[85vh] max-w-full rounded-sm object-contain"
          />
          <p className="mt-3 text-center font-mono text-xs text-white/80">
            {title}
            {caption ? ` · ${caption}` : ""}
            <span className="ml-2 text-white/40">click anywhere or press Esc to close</span>
          </p>
        </div>
      )}
    </>
  );
}
