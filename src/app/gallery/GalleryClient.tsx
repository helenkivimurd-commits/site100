"use client";

import { useMemo, useState } from "react";
import PhotoGrid from "@/components/PhotoGrid";
import type { Photo } from "@/lib/types";

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

  const disciplines = useMemo(() => {
    const set = new Set(photos.map((p) => p.discipline));
    return ["All", ...Array.from(set)];
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

  const results = useMemo(() => {
    const q = bib.trim().toUpperCase();
    return photos.filter((p) => {
      const matchesBib = q ? p.bibs.some((b) => b.toUpperCase().includes(q)) : true;
      const matchesDiscipline = discipline === "All" || p.discipline === discipline;
      const matchesDay = day === "All days" || p.day === day;
      return matchesBib && matchesDiscipline && matchesDay;
    });
  }, [photos, bib, discipline, day]);

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
        {days.length > 2 && (
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 pb-3 sm:px-8">
            {days.map((d) => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                  day === d ? "bg-blue text-white" : "bg-card text-muted hover:text-ink"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 pb-4 sm:px-8">
          {disciplines.map((d) => (
            <button
              key={d}
              onClick={() => setDiscipline(d)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
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
          <PhotoGrid photos={results} />
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
