"use client";

import { useMemo, useState } from "react";
import PhotoGrid from "@/components/PhotoGrid";
import type { Photo } from "@/lib/types";
import { matchBibs, comparePartials } from "@/lib/bibMatch";

export default function GalleryClient({
  photos,
  initialBib,
}: {
  photos: Photo[];
  initialBib: string;
}) {
  const [bib, setBib] = useState(initialBib);
  const [discipline, setDiscipline] = useState<string>("All");
  const [day, setDay] = useState<string>("All days");
  const [event, setEvent] = useState<string>("All events");

  const disciplines = useMemo(() => {
    const set = new Set(photos.map((p) => p.discipline));
    return ["All", ...Array.from(set)];
  }, [photos]);

  // Only worth showing once she has shot more than one race; before that the
  // row would be a single chip that filters nothing.
  const events = useMemo(() => {
    const set = new Set(photos.map((p) => p.event).filter(Boolean));
    return ["All events", ...Array.from(set).sort()];
  }, [photos]);

  const days = useMemo(() => {
    const set = new Set(photos.map((p) => p.day));
    // Sort chronologically by the "Mon DD" part — the exact year doesn't matter
    // since every photo in the catalog is from the same event window.
    const sorted = Array.from(set).sort(
      (a, b) =>
        new Date(`${a.split(", ")[1]} 2024`).getTime() -
        new Date(`${b.split(", ")[1]} 2024`).getTime()
    );
    return ["All days", ...sorted];
  }, [photos]);

  // Split into two lists rather than one. `results` is what we are confident
  // about; `maybes` are photos whose bib was only partly readable when it was
  // tagged, so the number written on them is a piece of what the buyer typed.
  // Those are shown apart and clearly hedged — a runner must never be nudged
  // into buying a photo of somebody else.
  const { results, maybes } = useMemo(() => {
    const q = bib.trim();
    const confident: Photo[] = [];
    const partial: { photo: Photo; visible: number; contiguous: boolean }[] = [];

    for (const p of photos) {
      if (discipline !== "All" && p.discipline !== discipline) continue;
      if (day !== "All days" && p.day !== day) continue;
      if (event !== "All events" && p.event !== event) continue;

      if (!q) {
        confident.push(p);
        continue;
      }

      const match = matchBibs(q, p.bibs);
      if (!match) continue;
      if (match.kind === "partial") {
        partial.push({ photo: p, visible: match.visible, contiguous: match.contiguous });
      } else {
        confident.push(p);
      }
    }

    partial.sort(comparePartials);
    return { results: confident, maybes: partial.map((m) => m.photo) };
  }, [photos, bib, discipline, day, event]);

  return (
    <div>
      <div className="sticky top-[73px] z-30 border-b border-card bg-page/95 backdrop-blur sm:top-[81px]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <h1 className="font-display text-3xl uppercase tracking-wide sm:text-4xl">
              All photos
            </h1>
            <p className="font-mono text-xs text-muted">
              {results.length} photo{results.length === 1 ? "" : "s"}
              {bib ? ` matching bib "${bib}"` : ""}
            </p>
          </div>
          <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-ink/15 bg-page px-3">
            <span className="font-mono text-sm text-muted">#</span>
            <input
              value={bib}
              onChange={(e) => setBib(e.target.value)}
              inputMode="numeric"
              placeholder="Filter by bib number"
              aria-label="Filter by bib number"
              className="w-full bg-transparent py-2.5 font-mono text-sm text-ink outline-none placeholder:text-muted"
            />
            {bib && (
              <button
                onClick={() => setBib("")}
                aria-label="Clear bib filter"
                className="text-muted transition-colors hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {events.length > 2 && (
          <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-5 pb-3 sm:px-8">
            {events.map((e) => (
              <button
                key={e}
                onClick={() => setEvent(e)}
                className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                  event === e ? "bg-ink text-white" : "bg-card text-muted hover:text-ink"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {days.length > 2 && (
          <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-5 pb-3 sm:px-8">
            {days.map((d) => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                  day === d ? "bg-blue text-white" : "bg-card text-muted hover:text-ink"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {/* Wraps rather than scrolling sideways: on a phone the row used to be
            clipped mid-chip, so Swim and Transition were invisible with nothing
            to suggest more existed. One extra row is worth them being findable. */}
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-5 pb-4 sm:px-8">
          {disciplines.map((d) => (
            <button
              key={d}
              onClick={() => setDiscipline(d)}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                discipline === d
                  ? "border-ink bg-ink text-white"
                  : "border-ink/15 text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        {results.length > 0 ? (
          <>
            <PhotoGrid photos={results} />
            {maybes.length > 0 && <MaybeSection photos={maybes} bib={bib} />}
          </>
        ) : maybes.length > 0 ? (
          <MaybeSection photos={maybes} bib={bib} soleResult />
        ) : (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="font-display text-3xl uppercase tracking-wide text-muted">
              No photos found
            </p>
            <p className="max-w-sm text-sm text-muted">
              {bib
                ? `We couldn't find bib "${bib}" yet. Results are added a few times a day during the event — try again later, or check the number and try once more.`
                : "Try a different bib number or clear the filter to browse everything."}
            </p>
            {bib && (
              <button
                onClick={() => setBib("")}
                className="mt-2 rounded-full border border-ink px-5 py-2 font-mono text-sm uppercase tracking-wide transition-colors hover:bg-ink hover:text-white"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Photos whose bib was only partly legible when it was tagged. Presented as a
// question rather than an answer: the heading says "might", the explanation
// says why, and it sits below the confident results so it never looks like the
// main answer to the search.
function MaybeSection({
  photos,
  bib,
  soleResult = false,
}: {
  photos: Photo[];
  bib: string;
  soleResult?: boolean;
}) {
  return (
    <section className={soleResult ? "" : "mt-16 border-t border-card pt-10"}>
      <h2 className="font-display text-2xl uppercase tracking-wide sm:text-3xl">
        {soleResult ? "These might be you" : "More that might be you"}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        {photos.length} photo{photos.length === 1 ? "" : "s"} where only part of the bib could be
        read &mdash; an arm or another runner was in the way &mdash; and what could be read fits{" "}
        <span className="font-mono text-ink">{bib}</span>. Check them before buying: the rest of
        the number is hidden, so some of these will be other runners.
      </p>
      <div className="mt-6">
        <PhotoGrid photos={photos} />
      </div>
    </section>
  );
}
