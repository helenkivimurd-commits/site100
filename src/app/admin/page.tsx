"use client";

import Link from "next/link";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { DISCIPLINES, type Discipline } from "@/lib/types";
import { selectionAfterClick } from "@/lib/selection";
import PhotoInspector from "./PhotoInspector";

type Row = {
  id: string;
  title: string;
  day: string;
  event: string;
  discipline: Discipline;
  bibsText: string;
  noBib: boolean;
  reviewed: boolean;
  saving: boolean;
  saved: boolean;
  // Set when the server rejected the last save. Without this a failed PATCH
  // still rendered "Saved" and the edit looked like it had stuck — which is
  // exactly how 14 bib edits were silently lost.
  error: string | null;
  deleting: boolean;
};

// Only the fields a row actually needs, so this also accepts the freshly
// uploaded photos returned by the API (which carry no `price`).
type RowSource = {
  id: string;
  title: string;
  day: string;
  discipline: Discipline;
  bibs: string[];
  reviewed: boolean;
  event?: string;
};

function toRow(p: RowSource): Row {
  return {
    id: p.id,
    title: p.title,
    day: p.day,
    event: p.event ?? FALLBACK_EVENT,
    discipline: p.discipline,
    bibsText: p.bibs.join(", "),
    noBib: p.reviewed && p.bibs.length === 0,
    reviewed: p.reviewed,
    saving: false,
    saved: false,
    error: null,
    deleting: false,
  };
}

// Three goes at each photo. Enough to ride out a restart or a moment of bad
// wifi; few enough that a genuinely broken file does not hold up the queue.
const UPLOAD_ATTEMPTS = 3;

const FALLBACK_EVENT = "IRONMAN 70.3 Tallinn European Championship";

export default function AdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unreviewed">("all");

  // Ids that were still untagged when "Unreviewed only" was switched on.
  // Filtering against this frozen set (rather than the live `reviewed` flag)
  // keeps a photo on screen after you tag it, so the list doesn't reshuffle
  // under you mid-pass. Re-picking the filter takes a fresh snapshot.
  const [unreviewedSnapshot, setUnreviewedSnapshot] = useState<Set<string>>(new Set());

  // Tagging is per-photo, but day, event and discipline are almost always the
  // same across a whole race. Editing 268 of them one at a time is not work
  // anybody should do by hand.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The row a plain click last landed on. Shift-clicking another row selects
  // everything between the two, the way a file list does — tagging a race means
  // picking out long runs of consecutive photos, and ticking three hundred
  // boxes one at a time is the slowest part of the job.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [bulkDay, setBulkDay] = useState("");
  const [bulkEvent, setBulkEvent] = useState("");
  const [bulkDiscipline, setBulkDiscipline] = useState<Discipline | "">("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");

  function showUnreviewed() {
    setUnreviewedSnapshot(new Set(rows.filter((r) => !r.reviewed).map((r) => r.id)));
    setFilter("unreviewed");
  }

// `day` is stored as the string shown to customers — on photo cards, in the
// cart, on the Stripe line item — and is what the gallery's day filter groups
// on. <input type="date"> only speaks ISO, so the picker holds the ISO value
// and this turns it into the display form: "2026-08-23" -> "Sunday, August 23".
function formatRaceDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  // Built from parts, not parsed from the string: new Date("2026-08-23") is
  // read as UTC midnight, which lands on the day before in western timezones.
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

  const [uploadEvent, setUploadEvent] = useState(FALLBACK_EVENT);
  const [uploadDay, setUploadDay] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [uploadDiscipline, setUploadDiscipline] = useState<Discipline>("Run");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Index into `visible`, so prev/next follow whatever list you're looking at.
  const [inspecting, setInspecting] = useState<number | null>(null);

  // Loaded over HTTP rather than imported, so editing a photo doesn't pull
  // the catalogue into this page's bundle (see the GET handler's note).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/photos");
      const body = (await res.json()) as { photos: RowSource[] };
      if (cancelled) return;
      setRows(body.photos.map(toRow));
      const last = body.photos[body.photos.length - 1];
      if (last) {
        setUploadEvent(last.event ?? FALLBACK_EVENT);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => unreviewedSnapshot.has(r.id))),
    [rows, filter, unreviewedSnapshot]
  );
  const reviewedCount = rows.filter((r) => r.reviewed).length;
  const stillUntagged = visible.filter((r) => !r.reviewed).length;

  // One request per photo rather than one for the whole selection. A batch of
  // camera JPEGs is 7MB each, so twenty at once is 140MB — past any sane body
  // limit, and the proxy silently truncated it ("expected boundary after body").
  // Sending them one at a time also means a single bad file doesn't lose the
  // rest of the batch, and the count below is real progress rather than a guess.
  async function handleUpload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (!uploadDay.trim() || !uploadEvent.trim()) {
      setUploadStatus("Fill in the event and day before uploading.");
      return;
    }

    setUploading(true);

    const day = formatRaceDay(uploadDay);
    const event = uploadEvent.trim();
    const added: RowSource[] = [];
    const failed: string[] = [];

    for (const [index, file] of list.entries()) {
      setUploadStatus(`Uploading ${index + 1} of ${list.length}: ${file.name}…`);

      const form = new FormData();
      form.append("files", file);
      form.append("event", event);
      form.append("day", day);
      form.append("discipline", uploadDiscipline);

      // A dropped connection used to lose that photo for good, and over a
      // batch of thousands there are always some: a moment of bad wifi, the
      // laptop dozing, the server restarting under a deploy. Each one is
      // retried before being given up on, so a blip costs seconds rather than
      // a photo the photographer then has to find and send again.
      let saved: RowSource[] | null = null;
      let lastError = "";


      for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
        try {
          const res = await fetch("/api/photos", { method: "POST", body: form });
          if (res.ok) {
            saved = ((await res.json()) as { created: RowSource[] }).created;
            break;
          }
          const body = await res.json().catch(() => ({}));
          lastError = body.error ?? `${file.name} failed.`;
          // A file the server has refused outright — too big, wrong format, not
          // an image it can read — will be refused again. Only retry when the
          // fault might be temporary.
          if (res.status !== 502 && res.status !== 503 && res.status !== 504) break;
        } catch {
          // The file read fine a moment ago, so this really is the network.
          lastError = `${file.name} — connection lost.`;
        }

        if (attempt < UPLOAD_ATTEMPTS) {
          setUploadStatus(
            `Uploading ${index + 1} of ${list.length}: ${file.name} — retrying (${attempt} of ${UPLOAD_ATTEMPTS - 1})…`
          );
          // Backing off a little gives a restarting server time to come back
          // rather than spending all three tries inside the same outage.
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }

      if (!saved) {
        // Only now, having actually failed, is it worth asking why. Reading a
        // byte off the file separates a photo the browser cannot get at from an
        // upload that did not land.
        //
        // This check used to run BEFORE the upload and skip the file when it
        // threw, which was a bad way round: a check meant to explain a failure
        // was able to cause one, and it rejected an entire batch of perfectly
        // readable photos without a single request reaching the server. A
        // diagnostic must never be able to block the thing it is diagnosing.
        let reason = lastError || `${file.name} failed.`;
        try {
          await file.slice(0, 1).arrayBuffer();
        } catch {
          reason = `${file.name} — couldn't be read from disk. If the photos are on an external drive or in iCloud, make sure they are available on this Mac.`;
        }
        failed.push(reason);
        continue;
      }

      added.push(...saved);

      // Appended as each one lands, so a long batch fills the list as it goes
      // instead of sitting blank until the end.
      setRows((prev) => [...prev, ...saved.map(toRow)]);
      setUnreviewedSnapshot((prev) => {
        const next = new Set(prev);
        for (const photo of saved) next.add(photo.id);
        return next;
      });
    }

    const parts = [];
    if (added.length) parts.push(`Added ${added.length} photo${added.length === 1 ? "" : "s"}.`);
    // Naming the count and what to do about it: a failed photo is simply not
    // in the catalogue, so choosing those files again is all it takes.
    if (failed.length) {
      parts.push(
        `${failed.length} failed after ${UPLOAD_ATTEMPTS} tries — pick those files again to retry. First: ${failed[0]}`
      );
    }
    setUploadStatus(parts.join(" ") || "Nothing uploaded.");
    setUploading(false);
  }

  async function save(id: string, fields: Partial<{ bibs: string[]; reviewed: boolean; day: string; discipline: Discipline; title: string }>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, saving: true, saved: false, error: null } : r)));

    // The response has to be checked. When the server could not write the
    // catalogue at all, every PATCH came back 500 and this still reported
    // "Saved", so the edits looked done and were not.
    let error: string | null = null;
    try {
      const res = await fetch("/api/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        error = body.error ?? `Save failed (${res.status})`;
      }
    } catch {
      error = "Save failed — no connection";
    }

    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? error
            // Keep what was typed, so nothing has to be retyped on a retry.
            ? { ...r, saving: false, saved: false, error }
            : { ...r, ...fields, bibsText: fields.bibs ? fields.bibs.join(", ") : r.bibsText, saving: false, saved: true, error: null }
          : r
      )
    );
  }

  function updateBibsText(id: string, bibsText: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, bibsText, saved: false } : r)));
  }

  function saveBibs(id: string, bibsText: string, noBib: boolean) {
    const bibs = noBib
      ? []
      : bibsText
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean);
    save(id, { bibs, reviewed: true });
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, noBib, reviewed: true } : r)));
  }

  function updateDay(id: string, day: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, day, saved: false } : r)));
  }

  function updateDiscipline(id: string, discipline: Discipline) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, discipline } : r)));
    save(id, { discipline });
  }

  function toggleSelected(id: string, extendRange = false) {
    setSelected((prev) => {
      const result = selectionAfterClick({
        // What is on screen, in the order it appears — so a range follows what
        // was actually clicked even with "Unreviewed only" on.
        visibleIds: visible.map((r) => r.id),
        clickedId: id,
        anchorId,
        selected: prev,
        extendRange,
      });
      setAnchorId(result.anchorId);
      return result.selected;
    });
  }

  // Selects what is currently on screen rather than the whole library, so it
  // respects the "Unreviewed only" filter — selecting a batch you cannot see
  // would be a good way to change the wrong photos.
  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === visible.length ? new Set() : new Set(visible.map((r) => r.id))
    );
  }

  // Only the fields you actually filled in are sent, so setting a date does not
  // silently overwrite the event on every selected photo.
  async function applyBulk() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const fields: { day?: string; event?: string; discipline?: Discipline } = {};
    if (bulkDay) fields.day = formatRaceDay(bulkDay);
    if (bulkEvent.trim()) fields.event = bulkEvent.trim();
    if (bulkDiscipline) fields.discipline = bulkDiscipline;

    if (Object.keys(fields).length === 0) {
      setBulkStatus("Pick a date, event or discipline to apply first.");
      return;
    }

    setBulkBusy(true);
    let done = 0;
    // Only the ids the server actually accepted get their row updated, so the
    // list never shows a change that did not happen.
    const applied: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      done += 1;
      setBulkStatus(`Updating ${done} of ${ids.length}…`);
      try {
        const res = await fetch("/api/photos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...fields }),
        });
        if (res.ok) applied.push(id);
        else failed.push(id);
      } catch {
        failed.push(id);
      }
    }

    const appliedSet = new Set(applied);
    setRows((prev) => prev.map((r) => (appliedSet.has(r.id) ? { ...r, ...fields } : r)));
    setBulkStatus(
      failed.length === 0
        ? `Updated ${applied.length} photo${applied.length === 1 ? "" : "s"}.`
        : `Updated ${applied.length}, but ${failed.length} failed — try those again.`
    );
    setBulkBusy(false);
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} photo${ids.length === 1 ? "" : "s"}? This removes the files and can't be undone.`
      )
    )
      return;

    setBulkBusy(true);
    let done = 0;
    const removed = new Set<string>();
    let failed = 0;
    for (const id of ids) {
      done += 1;
      setBulkStatus(`Deleting ${done} of ${ids.length}…`);
      try {
        const res = await fetch(`/api/photos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (res.ok) removed.add(id);
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    // Anything the server refused to delete stays in the list, rather than
    // disappearing from view while still existing.
    setRows((prev) => prev.filter((r) => !removed.has(r.id)));
    setSelected(new Set());
    setBulkStatus(
      failed === 0
        ? `Deleted ${removed.size} photo${removed.size === 1 ? "" : "s"}.`
        : `Deleted ${removed.size}, but ${failed} failed.`
    );
    setBulkBusy(false);
  }

  async function deletePhoto(id: string) {
    if (!window.confirm("Delete this photo? This removes the files and can't be undone.")) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, deleting: true } : r)));
    let ok = false;
    try {
      const res = await fetch(`/api/photos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      ok = res.ok;
    } catch {
      ok = false;
    }
    setRows((prev) =>
      ok
        ? prev.filter((r) => r.id !== id)
        : prev.map((r) => (r.id === id ? { ...r, deleting: false, error: "Delete failed" } : r))
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Internal tool</p>
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide sm:text-4xl">
        Manage photos
      </h1>
      <p className="mt-2 text-sm text-muted">
        Upload new race photos and tag bib numbers here. This page is password-protected —
        anyone without the admin password gets a login box instead.
      </p>

      <div
        className="mt-6 flex flex-col gap-4 rounded-md border-2 border-dashed border-ink/20 bg-card p-5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
        }}
      >
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Upload photos</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Event</label>
            <input
              value={uploadEvent}
              onChange={(e) => setUploadEvent(e.target.value)}
              className="rounded-md border border-ink/15 bg-page px-3 py-2 text-sm outline-none focus:border-blue"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Day</label>
            <input
              type="date"
              value={uploadDay}
              onChange={(e) => setUploadDay(e.target.value)}
              className="rounded-md border border-ink/15 bg-page px-3 py-2 text-sm outline-none focus:border-blue"
            />
            {/* The picker shows a calendar; this shows what customers will
                actually read on the photo, so it can be checked before upload. */}
            <p className="font-mono text-xs text-muted">
              {formatRaceDay(uploadDay) || "Pick a date"}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Discipline</label>
            <select
              value={uploadDiscipline}
              onChange={(e) => setUploadDiscipline(e.target.value as Discipline)}
              className="rounded-md border border-ink/15 bg-page px-3 py-2 text-sm outline-none focus:border-blue"
            >
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-md border border-ink/25 bg-page py-6 text-center font-mono text-sm text-muted transition-colors hover:border-blue hover:text-blue disabled:opacity-50"
        >
          {uploading ? uploadStatus || "Uploading…" : "Click to choose photos, or drag them here"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handleUpload(e.target.files);
            e.target.value = "";
          }}
        />
        {!uploading && uploadStatus && (
          <p className="font-mono text-xs text-muted">{uploadStatus}</p>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 border-y border-card py-3">
        <span className="font-mono text-sm text-muted">
          {reviewedCount} / {rows.length} reviewed
          {filter === "unreviewed" && (
            <span className="text-ink">
              {" "}
              · {stillUntagged} left in this batch
            </span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin/tag"
            className="rounded-full bg-blue px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide text-white transition-colors hover:bg-blue-hover"
          >
            Fast tagging
          </Link>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted">
            <input
              type="checkbox"
              checked={visible.length > 0 && selected.size === visible.length}
              onChange={toggleSelectAll}
            />
            Select all
          </label>
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-wide ${
              filter === "all" ? "border-ink bg-ink text-white" : "border-ink/15 text-muted"
            }`}
          >
            All
          </button>
          <button
            onClick={showUnreviewed}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-wide ${
              filter === "unreviewed" ? "border-ink bg-ink text-white" : "border-ink/15 text-muted"
            }`}
          >
            {filter === "unreviewed" ? "Refresh list" : "Unreviewed only"}
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-[73px] z-20 mt-4 rounded-md border border-blue bg-page p-4 shadow-sm sm:top-[81px]">
          <div className="flex flex-wrap items-end gap-3">
            <p className="font-mono text-xs uppercase tracking-wide text-blue">
              {selected.size} selected
            </p>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[11px] uppercase tracking-wide text-muted">Day</label>
              <input
                type="date"
                value={bulkDay}
                onChange={(e) => setBulkDay(e.target.value)}
                className="rounded-md border border-ink/15 bg-page px-2 py-1.5 text-sm outline-none focus:border-blue"
              />
            </div>
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <label className="font-mono text-[11px] uppercase tracking-wide text-muted">Event</label>
              <input
                value={bulkEvent}
                onChange={(e) => setBulkEvent(e.target.value)}
                placeholder="Leave blank to keep"
                className="rounded-md border border-ink/15 bg-page px-2 py-1.5 text-sm outline-none focus:border-blue"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[11px] uppercase tracking-wide text-muted">
                Discipline
              </label>
              <select
                value={bulkDiscipline}
                onChange={(e) => setBulkDiscipline(e.target.value as Discipline | "")}
                className="rounded-md border border-ink/15 bg-page px-2 py-1.5 text-sm outline-none focus:border-blue"
              >
                <option value="">Keep</option>
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={applyBulk}
              disabled={bulkBusy}
              className="rounded-full bg-blue px-5 py-2 font-mono text-xs uppercase tracking-wide text-white transition-colors hover:bg-blue-hover disabled:opacity-50"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={bulkBusy}
              className="font-mono text-xs uppercase tracking-wide text-muted hover:text-ink disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={bulkBusy}
              className="ml-auto font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-magenta disabled:opacity-50"
            >
              Delete selected
            </button>
          </div>
          {/* Shows what customers will read, the same as the upload form does. */}
          {(bulkDay || bulkStatus) && (
            <p className="mt-3 font-mono text-xs text-muted">
              {bulkStatus || `Day becomes: ${formatRaceDay(bulkDay)}`}
            </p>
          )}
        </div>
      )}

      {loading && (
        <p className="py-10 text-center font-mono text-sm text-muted">Loading photos…</p>
      )}

      <ul className="divide-y divide-card">
        {visible.map((row, i) => (
          <li
            key={row.id}
            // In the unreviewed batch, tagged rows stay put but fade back so
            // it's obvious at a glance what's still outstanding.
            className={`flex flex-wrap items-center gap-3 py-3 ${
              filter === "unreviewed" && row.reviewed ? "opacity-45" : ""
            }`}
          >
            {/* A generous target: the checkbox is scaled up and the padding
                around it is part of the label, so the whole corner is clickable
                rather than a 13px square. */}
            <label className="-m-1 shrink-0 cursor-pointer p-1">
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                // The shift key is read from the click, not the change: a
                // change event carries no modifier keys, so asking it whether
                // shift was held always answered no.
                onClick={(e) => {
                  // Shift-clicking otherwise drags the browser's text selection
                  // across the rows in between and turns the page blue.
                  if (e.shiftKey) window.getSelection()?.removeAllRanges();
                  toggleSelected(row.id, e.shiftKey);
                }}
                // Controlled by `checked` above and updated in onClick; React
                // asks for this handler all the same.
                onChange={() => {}}
                aria-label={`Select ${row.title}`}
                className="h-5 w-5 cursor-pointer accent-blue"
              />
            </label>
            <button
              type="button"
              onClick={() => setInspecting(i)}
              aria-label={`View ${row.title} full size`}
              className="group relative h-16 w-24 shrink-0 overflow-hidden rounded bg-card"
            >
              <Image
                src={`/api/photo/thumb/${row.id}`}
                alt={row.title}
                fill
                sizes="96px"
                className="object-cover transition-transform duration-200 group-hover:scale-105"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-ink/50 opacity-0 transition-opacity group-hover:opacity-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
                  <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
            </button>
            <div className="min-w-0 flex-1 basis-32">
              <p className="truncate text-sm font-medium">{row.title}</p>
              <p className="font-mono text-xs text-muted">{row.id.toUpperCase()}</p>
            </div>
            <input
              value={row.day}
              onChange={(e) => updateDay(row.id, e.target.value)}
              onBlur={() => save(row.id, { day: row.day })}
              className="w-28 shrink-0 rounded-md border border-ink/15 bg-page px-2 py-2 font-mono text-xs outline-none focus:border-blue"
            />
            <select
              value={row.discipline}
              onChange={(e) => updateDiscipline(row.id, e.target.value as Discipline)}
              className="shrink-0 rounded-md border border-ink/15 bg-page px-2 py-2 font-mono text-xs outline-none focus:border-blue"
            >
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              value={row.bibsText}
              onChange={(e) => updateBibsText(row.id, e.target.value)}
              onBlur={() => saveBibs(row.id, row.bibsText, row.noBib)}
              disabled={row.noBib}
              placeholder="e.g. 2037, 260"
              className="w-32 shrink-0 rounded-md border border-ink/15 bg-page px-2 py-2 font-mono text-xs outline-none focus:border-blue disabled:opacity-40"
            />
            <label className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted">
              <input
                type="checkbox"
                checked={row.noBib}
                onChange={(e) => saveBibs(row.id, row.bibsText, e.target.checked)}
              />
              No bib
            </label>
            <span className="w-14 shrink-0 text-right font-mono text-xs">
              {row.saving ? (
                <span className="text-muted">Saving…</span>
              ) : row.error ? (
                <span className="text-red-600" title={row.error}>
                  Not saved
                </span>
              ) : row.saved ? (
                <span className="text-blue">Saved</span>
              ) : row.reviewed ? (
                <span className="text-muted">✓</span>
              ) : null}
            </span>
            <button
              onClick={() => deletePhoto(row.id)}
              disabled={row.deleting}
              className="shrink-0 font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-magenta disabled:opacity-40"
            >
              {row.deleting ? "…" : "Delete"}
            </button>
          </li>
        ))}
      </ul>

      {inspecting !== null && visible[inspecting] && (
        <PhotoInspector
          key={visible[inspecting].id}
          photo={visible[inspecting]}
          position={inspecting + 1}
          total={visible.length}
          onClose={() => setInspecting(null)}
          onPrev={inspecting > 0 ? () => setInspecting(inspecting - 1) : undefined}
          onNext={
            inspecting < visible.length - 1 ? () => setInspecting(inspecting + 1) : undefined
          }
          onChangeBibs={(text) => updateBibsText(visible[inspecting].id, text)}
          onSave={(text, noBib) => saveBibs(visible[inspecting].id, text, noBib)}
          onChangeDiscipline={(d) => updateDiscipline(visible[inspecting].id, d)}
          // The index is deliberately left alone: removing this row shifts the
          // next photo into the same slot, so a cull run keeps moving forward
          // rather than dropping you back to the list after every delete.
          onDelete={() => deletePhoto(visible[inspecting].id)}
        />
      )}
    </div>
  );
}
