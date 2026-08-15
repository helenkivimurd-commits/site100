"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function BibSearch({
  variant = "hero",
  initialValue = "",
}: {
  variant?: "hero" | "compact";
  initialValue?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (value.trim()) params.set("bib", value.trim());
    router.push(`/gallery${params.toString() ? `?${params.toString()}` : ""}`);
  }

  if (variant === "compact") {
    return (
      <form onSubmit={handleSubmit} className="flex w-full max-w-md items-stretch gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-ink/15 bg-page px-3">
          <span className="font-mono text-muted text-sm">#</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            placeholder="Bib number"
            aria-label="Bib number"
            className="w-full bg-transparent py-2.5 font-mono text-sm text-ink outline-none placeholder:text-muted"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-md bg-blue px-4 font-mono text-sm text-white transition-colors hover:bg-blue-hover"
        >
          Find
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative mx-auto w-full max-w-sm -rotate-2 rounded-sm bg-[#fbfbfd] px-6 pb-6 pt-8 shadow-[0_18px_50px_-12px_rgba(20,22,43,0.45)] sm:max-w-md sm:px-8 sm:pb-8 sm:pt-9"
    >
      <span
        aria-hidden
        className="absolute left-4 top-3 h-2.5 w-2.5 rounded-full bg-ink/15 shadow-inner sm:left-5"
      />
      <span
        aria-hidden
        className="absolute right-4 top-3 h-2.5 w-2.5 rounded-full bg-ink/15 shadow-inner sm:right-5"
      />

      <p className="text-center font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
        Ironman Tallinn · Race Bib
      </p>
      <label
        htmlFor="bib-input"
        className="mt-4 block text-center font-mono text-xs uppercase tracking-[0.2em] text-muted"
      >
        Your bib number
      </label>
      {/* Placeholder kept very faint: at this size a darker one reads as a
          number already filled in rather than an example. */}
      <input
        id="bib-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="numeric"
        placeholder="2037"
        aria-label="Your bib number"
        className="mt-2 w-full border-b-2 border-dashed border-ink/20 bg-transparent pb-2 text-center font-mono text-5xl font-medium tracking-wide text-ink outline-none placeholder:text-ink/15 sm:text-6xl"
      />
      <button
        type="submit"
        className="mt-6 w-full rounded-full bg-blue py-3.5 font-mono text-sm uppercase tracking-wide text-white transition-colors hover:bg-blue-hover active:bg-blue-active"
      >
        Find my photos
      </button>
      <p className="mt-3 text-center text-xs text-muted">
        No bib number handy? <a href="/gallery" className="text-blue hover:text-blue-hover">Browse every photo</a> instead.
      </p>
    </form>
  );
}
