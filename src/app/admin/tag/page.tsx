"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// A screen for doing nothing but typing bib numbers, as fast as they can be
// typed. The main admin page is a list built for editing anything about any
// photo; this is built for one job, where the only thing that matters is how
// many photos a minute get a number.
//
// Everything is on the keyboard, because reaching for the mouse between every
// photo is most of the time spent. The one that saves the most is "same as the
// last one": a runner appears in five or ten consecutive frames, so most photos
// carry the number typed a moment ago.

type Photo = {
  id: string;
  title: string;
  event: string;
  day: string;
  discipline: string;
  bibs: string[];
  reviewed: boolean;
};

type Status = "idle" | "saving" | "saved" | "error";

export default function TagPage() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [lastBibs, setLastBibs] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [event, setEvent] = useState("All events");
  const [discipline, setDiscipline] = useState("All");
  const [zoom, setZoom] = useState(false);
  const [done, setDone] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/photos");
      if (!res.ok) {
        setError(`Couldn't load photos (${res.status})`);
        setPhotos([]);
        return;
      }
      const body = (await res.json()) as { photos: Photo[] };
      setPhotos(body.photos);
    })();
  }, []);

  const events = useMemo(() => {
    if (!photos) return [];
    return ["All events", ...Array.from(new Set(photos.map((p) => p.event).filter(Boolean))).sort()];
  }, [photos]);

  const disciplines = useMemo(() => {
    if (!photos) return [];
    return ["All", ...Array.from(new Set(photos.map((p) => p.discipline).filter(Boolean))).sort()];
  }, [photos]);

  // Only photos still waiting for a decision. Anything already tagged or marked
  // is out of the way, so the queue is exactly the work left.
  const queue = useMemo(() => {
    if (!photos) return [];
    return photos.filter(
      (p) =>
        !p.reviewed &&
        p.bibs.length === 0 &&
        (event === "All events" || p.event === event) &&
        (discipline === "All" || p.discipline === discipline)
    );
  }, [photos, event, discipline]);

  const current = queue[index];

  // The next several are fetched before they are needed. That both fills the
  // browser\'s cache and, more importantly, warms the server\'s: the first view
  // of a photo costs a fetch from the bucket and a resize, and doing that in
  // advance is the difference between waiting seconds and waiting none.
  useEffect(() => {
    for (let i = 1; i <= 6; i++) {
      const next = queue[index + i];
      if (!next) break;
      const img = new Image();
      img.src = `/api/photos/original?id=${encodeURIComponent(next.id)}&size=view`;
    }
  }, [queue, index]);

  // Everything that changes which photo is showing clears the field itself,
  // rather than an effect watching for it. An effect would also fire on the
  // re-render after a save and wipe a number typed in the meantime.
  const showAnother = useCallback((move: (i: number) => number) => {
    setIndex(move);
    setValue("");
    setZoom(false);
    setStatus("idle");
  }, []);

  // Focus follows the photo. This is a DOM call, not state, so it belongs here.
  useEffect(() => {
    inputRef.current?.focus();
  }, [index, event, discipline, current?.id]);

  const save = useCallback(
    async (bibsText: string, noBib: boolean) => {
      if (!current) return;
      const bibs = noBib
        ? []
        : bibsText.split(/[, ]+/).map((b) => b.trim()).filter(Boolean);
      if (!noBib && bibs.length === 0) return; // nothing typed; ignore the keypress

      setStatus("saving");
      try {
        const res = await fetch("/api/photos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: current.id, bibs, reviewed: true }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? `Save failed (${res.status})`);
          setStatus("error");
          return;
        }
      } catch {
        setError("Save failed — no connection");
        setStatus("error");
        return;
      }

      // Kept locally too, so going back shows what was just decided rather than
      // the photo appearing untouched.
      setPhotos((prev) =>
        prev ? prev.map((p) => (p.id === current.id ? { ...p, bibs, reviewed: true } : p)) : prev
      );
      if (!noBib) setLastBibs(bibs.join(", "));
      setDone((n) => n + 1);
      setStatus("saved");
      setValue("");
      setZoom(false);
      // The photo leaves the queue as soon as it is saved, so the one that was
      // next slides into this position and the index stays put.
    },
    [current]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Typing a number has to work the moment a photo appears, without
      // clicking anything first. Clicking the photo to zoom, or touching one of
      // the pickers, moves the focus off the field — and then the digits went
      // nowhere. Anything typed outside the field is taken here instead, so the
      // keyboard always reaches the number.
      const inField = e.target === inputRef.current;
      if (!inField) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          setValue((v) => v + e.key);
          inputRef.current?.focus();
          return;
        }
        if (e.key === "Backspace") {
          e.preventDefault();
          setValue((v) => v.slice(0, -1));
          inputRef.current?.focus();
          return;
        }
      }

      if (e.key === "Enter") {
        e.preventDefault();
        save(value, false);
      } else if (e.key === "Tab" && lastBibs) {
        // Same runner as the last photo — the commonest case by far.
        e.preventDefault();
        save(lastBibs, false);
      } else if (e.key.toLowerCase() === "n") {
        // Whatever has been typed, N means there is no readable number. It used
        // to be ignored unless the field was empty, which made it look broken:
        // one stray character — including a previous "n" that had landed in the
        // field as text — and the key stopped working with nothing to show why.
        e.preventDefault();
        save("", true);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        showAnother((i) => Math.min(i + 1, Math.max(queue.length - 1, 0)));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        showAnother((i) => Math.max(i - 1, 0));
      } else if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        setZoom((z) => !z);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, value, lastBibs, queue.length, showAnother]);

  if (photos === null) {
    return <Shell><p className="font-mono text-sm text-muted">Loading photos…</p></Shell>;
  }

  if (!current) {
    return (
      <Shell>
        <div className="text-center">
          <p className="font-display text-3xl uppercase tracking-wide">Nothing left to tag</p>
          <p className="mt-2 text-sm text-muted">
            {done > 0 ? `${done} tagged in this session. ` : ""}
            Every photo in this selection has a number or is marked as having none.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Picker label="Event" value={event} options={events} onChange={setEvent} />
            <Picker label="Album" value={discipline} options={disciplines} onChange={setDiscipline} />
          </div>
          <Link href="/admin" className="mt-6 inline-block font-mono text-xs uppercase tracking-wide text-blue">
            Back to manage photos
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <div className="flex h-[calc(100vh-73px)] flex-col sm:h-[calc(100vh-81px)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card px-5 py-2.5 sm:px-8">
        <div className="flex items-center gap-3">
          <Picker label="Event" value={event} options={events} onChange={(v) => { setEvent(v); showAnother(() => 0); }} />
          <Picker label="Album" value={discipline} options={disciplines} onChange={(v) => { setDiscipline(v); showAnother(() => 0); }} />
        </div>
        <p className="font-mono text-xs text-muted">
          {queue.length} left{done > 0 ? ` · ${done} done` : ""} · {current.title}
        </p>
        <Link href="/admin" className="font-mono text-xs uppercase tracking-wide text-muted hover:text-ink">
          Manage photos
        </Link>
      </div>

      <div className="relative flex-1 overflow-hidden bg-ink/95">
        {/* A plain img: this is an API-rendered original, and next/image would
            only re-encode something the route has already sized. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={`${current.id}-${zoom ? "full" : "view"}`}
          // Small by default because most bibs read perfectly at that size and
          // it arrives in a fraction of the time; zoom swaps in the full one,
          // which is what a helmet sticker needs.
          src={`/api/photos/original?id=${encodeURIComponent(current.id)}&size=${zoom ? "full" : "view"}`}
          alt=""
          onClick={() => {
            setZoom((z) => !z);
            inputRef.current?.focus();
          }}
          className={`h-full w-full transition-transform duration-150 ${
            zoom ? "scale-[2.5] cursor-zoom-out object-contain" : "cursor-zoom-in object-contain"
          }`}
        />
      </div>

      <div className="border-t border-card px-5 py-3 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            value={value}
            // Digits, spaces and commas only. A letter in here could never be
            // part of a bib, and one sitting unnoticed in the field was enough
            // to make the shortcuts behave strangely.
            onChange={(e) => setValue(e.target.value.replace(/[^0-9, ]/g, ""))}
            inputMode="numeric"
            autoFocus
            onBlur={(e) => {
              // Unless the photographer has deliberately gone to a picker, the
              // field takes the keyboard back: on this screen there is nothing
              // else to type into.
              const goingTo = e.relatedTarget as HTMLElement | null;
              if (goingTo?.tagName === "SELECT" || goingTo?.tagName === "A") return;
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            placeholder="Bib number"
            aria-label="Bib number"
            className="min-w-0 flex-1 rounded-md border border-ink/15 px-4 py-3 font-mono text-2xl text-ink outline-none focus:border-ink"
          />
          <span className="font-mono text-xs text-muted">
            {status === "saving" && "saving…"}
            {status === "saved" && <span className="text-blue">saved</span>}
            {status === "error" && <span className="text-red-600">{error}</span>}
          </span>
        </div>
        <p className="mx-auto mt-2 max-w-3xl font-mono text-[11px] uppercase tracking-wide text-muted">
          Enter save &middot; Tab same as last{lastBibs ? ` (${lastBibs})` : ""} &middot; N no bib &middot; Z zoom
          &middot; &larr; &rarr; skip
        </p>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-3xl items-center justify-center px-5 py-24 sm:px-8">{children}</div>;
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-ink/15 bg-page px-2 py-1 font-mono text-xs text-ink"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
