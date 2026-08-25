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
  alsoNoBib?: boolean;
};

type Status = "idle" | "saving" | "saved" | "error";

const MODE_LABELS: Record<string, "new" | "check"> = {
  "Not tagged yet": "new",
  "Check Google's guesses": "check",
};
const MODE_NAMES = Object.keys(MODE_LABELS);

export default function TagPage() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [index, setIndex] = useState(0);
  // null means untouched: the box shows whatever the photo already says. Kept
  // apart from the photo's own number so that clearing it stays cleared.
  const [typed, setTyped] = useState<string | null>(null);
  // Which pile to work through: photos with no number, or Google's guesses
  // waiting to be confirmed.
  const [mode, setMode] = useState<"new" | "check">("new");
  const [lastBibs, setLastBibs] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [event, setEvent] = useState("All events");
  const [discipline, setDiscipline] = useState("All");
  const [zoom, setZoom] = useState(false);
  // Where the zoom is centred, as a percentage across the photo. Zooming always
  // from the middle was useless for the frames that need it most: a bib on a
  // race belt sits low and off to one side, and a helmet number is up near the
  // top — neither is in the middle of the picture.
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [done, setDone] = useState(0);
  // Every photo shown, oldest first, so going back is possible at all. Once a
  // photo is saved it leaves the queue, so stepping the queue index backwards
  // reaches the ones skipped and never the ones decided — which are exactly the
  // ones worth a second look when a number was mistyped.
  const [trail, setTrail] = useState<string[]>([]);
  // How far back she is looking. 0 is the photo waiting to be tagged.
  const [back, setBack] = useState(0);
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
        (mode === "check" ? p.bibs.length > 0 : p.bibs.length === 0) &&
        (event === "All events" || p.event === event) &&
        (discipline === "All" || p.discipline === discipline)
    );
  }, [photos, event, discipline, mode]);

  const byId = useMemo(() => new Map((photos ?? []).map((p) => [p.id, p])), [photos]);

  const photoAtBack = useCallback(
    (b: number) => (b === 0 ? queue[index] : byId.get(trail[trail.length - b] ?? "")),
    [queue, index, byId, trail]
  );

  const current = photoAtBack(back);
  const canGoBack = back < trail.length;

  // What a photo already says, written the way she would type it.
  const asTyped = (p: Photo | undefined) =>
    p ? p.bibs.join(", ") + (p.alsoNoBib ? ", n" : "") : "";

  // An untouched box starts with the number already on the photo whenever there
  // is one to judge — a guess being checked, or a photo being looked back at.
  // A blank photo starts empty.
  const suggested = back > 0 || mode === "check" ? asTyped(current) : "";
  const value = typed ?? suggested;

  // Written at the moment a photo is left, which is the only moment it is
  // certain — after a save the photo is gone from the queue, so nothing later
  // can tell that it was ever on screen.
  const remember = useCallback((id: string | undefined) => {
    if (!id) return;
    setTrail((t) => (t[t.length - 1] === id ? t : [...t, id].slice(-40)));
  }, []);

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
    setTyped(null);
    setZoom(false);
    setOrigin({ x: 50, y: 50 });
    setStatus("idle");
  }, []);

  // Focus follows the photo. This is a DOM call, not state, so it belongs here.
  useEffect(() => {
    inputRef.current?.focus();
  }, [index, event, discipline, current?.id]);

  // Moving through what has already been seen. Going back fills the field with
  // whatever that photo says now, so a wrong number is visible and can be typed
  // over rather than guessed at.
  const step = useCallback(
    (delta: number) => {
      const target = Math.max(0, Math.min(back + delta, trail.length));
      if (target === back) return false;
      setBack(target);
      setTyped(null);
      setZoom(false);
      setOrigin({ x: 50, y: 50 });
      setStatus("idle");
      return true;
    },
    [back, trail.length]
  );

  const save = useCallback(
    async (bibsText: string) => {
      if (!current) return;
      // "1234, n" — that runner, plus somebody in the same photo whose number
      // cannot be read. Both people have to be able to find the photo: one by
      // typing their number, the other by looking through the unreadable album.
      const marked = /n/i.test(bibsText);
      const bibs = bibsText.split(/[^0-9]+/).filter(Boolean);
      if (bibs.length === 0 && !marked) return; // nothing typed; ignore the keypress
      // With no number at all the photo is in that album anyway, so the flag is
      // only meaningful alongside one. Always sent, so retagging clears it.
      const alsoNoBib = marked && bibs.length > 0;

      setStatus("saving");
      try {
        const res = await fetch("/api/photos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: current.id, bibs, reviewed: true, alsoNoBib }),
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
        prev
          ? prev.map((p) =>
              p.id === current.id ? { ...p, bibs, reviewed: true, alsoNoBib } : p
            )
          : prev
      );
      if (bibs.length > 0) setLastBibs(bibs.join(", ") + (alsoNoBib ? ", n" : ""));
      // A photo already decided is being corrected, not tagged, so the count
      // stays honest.
      if (!current.reviewed) setDone((n) => n + 1);
      setStatus("saved");
      setTyped(null);
      setZoom(false);
      setOrigin({ x: 50, y: 50 });
      if (back === 0) remember(current.id);
      // Correcting an old photo returns to the one waiting, so fixing something
      // spotted in passing costs nothing but the correction itself.
      setBack(0);
      // The photo leaves the queue as soon as it is saved, so the one that was
      // next slides into this position and the index stays put.
    },
    [current, back, remember]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // The box arrives holding Google's guess. Typing a digit at all means
      // disagreeing with it, so the first one replaces the guess instead of
      // landing on the end of it — "370" and a typed 1 means 1, not 3701.
      // After that the box is hers and digits append normally.
      if (/^[0-9]$/.test(e.key) && typed === null && suggested) {
        e.preventDefault();
        setTyped(e.key);
        inputRef.current?.focus();
        return;
      }

      // Typing a number has to work the moment a photo appears, without
      // clicking anything first. Clicking the photo to zoom, or touching one of
      // the pickers, moves the focus off the field — and then the digits went
      // nowhere. Anything typed outside the field is taken here instead, so the
      // keyboard always reaches the number.
      const inField = e.target === inputRef.current;
      if (!inField) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          setTyped(value + e.key);
          inputRef.current?.focus();
          return;
        }
        if (e.key === "Backspace") {
          e.preventDefault();
          setTyped(value.slice(0, -1));
          inputRef.current?.focus();
          return;
        }
      }

      if (e.key === "Enter") {
        e.preventDefault();
        save(value);
      } else if (e.key === "Tab") {
        // Save and move on, like Enter. Whatever is typed wins; an empty box
        // repeats the last number, which is the common case of one runner
        // across several frames.
        //
        // It used to always save the previous number, so typing one and then
        // pressing Tab quietly filed the photo under the runner before — the
        // wrong person, with nothing on screen to say so.
        //
        // Always swallowed, even with nothing to save, so focus never jumps out
        // of the box to somewhere the keyboard no longer reaches the number.
        e.preventDefault();
        // Only what she actually typed counts as hers; a guess sitting in the
        // box is not an instruction to repeat it. Enter accepts the guess, Tab
        // reaches for the last number — two keys, two meanings.
        const line = typed?.trim() ? typed : lastBibs;
        if (line) save(line);
      } else if (e.key.toLowerCase() === "n") {
        // N always saves and always moves on, whatever has been typed. On an
        // empty field it means nobody here can be identified; after a number it
        // means that runner plus somebody who cannot be read.
        //
        // It used to only mark the line after a number and wait for Enter, so
        // pressing it appeared to do nothing — the photo stayed put — and
        // pressing it twice really did do nothing, because the marker was
        // already there. One key, one meaning: this photo is done.
        e.preventDefault();
        // Read from what she typed, not from the box: a guess showing there is
        // exactly what N is rejecting, so N on an untouched guess means nobody
        // readable is here and throws the guess away.
        const line = typed ?? "";
        const digits = /[0-9]/.test(line);
        const marked = /n/i.test(line);
        save(digits ? (marked ? line : `${line.replace(/[, ]+$/, "")}, n`) : "n");
      } else if (e.key === "ArrowLeft") {
        // Back through what has been seen, saved or skipped alike.
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        // Forward out of the past first; at the front it skips this photo.
        if (!step(-1)) {
          remember(current?.id);
          showAnother((i) => Math.min(i + 1, Math.max(queue.length - 1, 0)));
        }
      } else if (e.key === "Escape" && back > 0) {
        e.preventDefault();
        step(-back);
      } else if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        setZoom((z) => !z);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    save, value, lastBibs, queue.length, showAnother, step, back, remember,
    current?.id, typed, suggested,
  ]);

  const modeName = MODE_NAMES.find((n) => MODE_LABELS[n] === mode) ?? MODE_NAMES[0];
  const setModeByName = (n: string) => {
    remember(current?.id);
    setMode(MODE_LABELS[n] ?? "new");
    showAnother(() => 0);
  };

  if (photos === null) {
    return <Shell><p className="font-mono text-sm text-muted">Loading photos…</p></Shell>;
  }

  if (!current) {
    return (
      <Shell>
        <div className="text-center">
          <p className="font-display text-3xl uppercase tracking-wide">
            {mode === "check" ? "Nothing left to check" : "Nothing left to tag"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {done > 0 ? `${done} done in this session. ` : ""}
            {mode === "check"
              ? "Every guess in this selection has been confirmed or corrected."
              : "Every photo in this selection has a number or is marked as having none. Switch the pile to check Google's guesses."}
          </p>
          {canGoBack && (
            <p className="mt-2 font-mono text-xs text-muted">
              Press &larr; to look back over the ones just done.
            </p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Picker label="Event" value={event} options={events} onChange={setEvent} />
            <Picker label="Album" value={discipline} options={disciplines} onChange={setDiscipline} />
            <Picker label="Pile" value={modeName} options={MODE_NAMES} onChange={setModeByName} />
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
          <Picker label="Event" value={event} options={events} onChange={(v) => { remember(current?.id); setEvent(v); showAnother(() => 0); }} />
          <Picker label="Album" value={discipline} options={disciplines} onChange={(v) => { remember(current?.id); setDiscipline(v); showAnother(() => 0); }} />
          <Picker label="Pile" value={modeName} options={MODE_NAMES} onChange={setModeByName} />
        </div>
        <p className="font-mono text-xs text-muted">
          {back > 0
            ? `${back} back · ${current.title}`
            : `${queue.length} ${mode === "check" ? "to check" : "left"}${
                done > 0 ? ` · ${done} done` : ""
              } · ${current.title}`}
        </p>
        <Link href="/admin" className="font-mono text-xs uppercase tracking-wide text-muted hover:text-ink">
          Manage photos
        </Link>
      </div>

      <div
        className={`relative flex-1 overflow-hidden bg-ink/95 ${
          // Looking at the past has to be obvious at a glance, or a correction
          // gets typed into the wrong photo.
          back > 0 ? "ring-4 ring-inset ring-blue" : ""
        }`}
      >
        {back > 0 && (
          <p className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-blue px-4 py-1.5 font-mono text-xs uppercase tracking-wide text-white">
            {back} photo{back === 1 ? "" : "s"} back
            {current.reviewed ? ` · saved as ${asTyped(current) || "no bib"}` : " · not tagged yet"}
            {" · "}&rarr; forward
          </p>
        )}
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
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            setOrigin({
              x: ((e.clientX - box.left) / box.width) * 100,
              y: ((e.clientY - box.top) / box.height) * 100,
            });
            setZoom((z) => !z);
            inputRef.current?.focus();
          }}
          onMouseMove={(e) => {
            // Once zoomed, the mouse drags the view around like a magnifier,
            // so a number near an edge can be reached without zooming out and
            // clicking again.
            if (!zoom) return;
            const box = e.currentTarget.getBoundingClientRect();
            setOrigin({
              x: ((e.clientX - box.left) / box.width) * 100,
              y: ((e.clientY - box.top) / box.height) * 100,
            });
          }}
          style={{ transformOrigin: `${origin.x}% ${origin.y}%` }}
          className={`h-full w-full object-contain ${
            zoom ? "scale-[3] cursor-zoom-out" : "cursor-zoom-in transition-transform duration-150"
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
            onChange={(e) => setTyped(e.target.value.replace(/[^0-9, nN]/g, ""))}
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
          Enter or Tab saves &middot; Tab on an empty box repeats the last
          {lastBibs ? ` (${lastBibs})` : ""} &middot; N saves with no bib &middot; a number then N
          saves that runner + someone unreadable
          <br />
          &larr; back{canGoBack ? "" : " (nothing yet)"} &middot; &rarr; forward
          {back > 0 ? " · Esc return to the queue" : " (skip)"} &middot; click to zoom there, move to
          look around &middot; Z zoom
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
