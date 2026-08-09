"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { DISCIPLINES, type Discipline } from "@/lib/types";
import PhotoInspector from "./PhotoInspector";

type Row = {
  id: string;
  title: string;
  day: string;
  discipline: Discipline;
  bibsText: string;
  noBib: boolean;
  reviewed: boolean;
  saving: boolean;
  saved: boolean;
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
    discipline: p.discipline,
    bibsText: p.bibs.join(", "),
    noBib: p.reviewed && p.bibs.length === 0,
    reviewed: p.reviewed,
    saving: false,
    saved: false,
    deleting: false,
  };
}

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

  function showUnreviewed() {
    setUnreviewedSnapshot(new Set(rows.filter((r) => !r.reviewed).map((r) => r.id)));
    setFilter("unreviewed");
  }

  const [uploadEvent, setUploadEvent] = useState(FALLBACK_EVENT);
  const [uploadDay, setUploadDay] = useState("");
  const [uploadDiscipline, setUploadDiscipline] = useState<Discipline>("Run");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Index into `visible`, so prev/next follow whatever list you're looking at.
  const [inspecting, setInspecting] = useState<number | null>(null);

  // Loaded over HTTP rather than imported, so editing a photo doesn't pull
  // src/data/photos.json into this page's bundle (see the GET handler's note).
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
        setUploadDay(last.day);
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

  async function handleUpload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (!uploadDay.trim() || !uploadEvent.trim()) {
      setUploadStatus("Fill in the event and day before uploading.");
      return;
    }

    setUploading(true);
    setUploadStatus(`Uploading ${list.length} photo${list.length === 1 ? "" : "s"}…`);

    const form = new FormData();
    for (const file of list) form.append("files", file);
    form.append("event", uploadEvent.trim());
    form.append("day", uploadDay.trim());
    form.append("discipline", uploadDiscipline);

    const res = await fetch("/api/photos", { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setUploadStatus(body.error ?? "Upload failed. Try again.");
      setUploading(false);
      return;
    }

    // Append the new rows in place rather than reloading, so the page doesn't
    // jump back to the top and lose your scroll position mid-session.
    const body = (await res.json()) as { created: RowSource[] };
    setRows((prev) => [...prev, ...body.created.map(toRow)]);
    // Fresh uploads are untagged, so add them to the snapshot too — otherwise
    // they'd be invisible while "Unreviewed only" is on.
    setUnreviewedSnapshot((prev) => {
      const next = new Set(prev);
      for (const photo of body.created) next.add(photo.id);
      return next;
    });
    setUploadStatus(
      `Added ${body.created.length} photo${body.created.length === 1 ? "" : "s"} at the bottom of the list.`
    );
    setUploading(false);
  }

  async function save(id: string, fields: Partial<{ bibs: string[]; reviewed: boolean; day: string; discipline: Discipline; title: string }>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, saving: true, saved: false } : r)));

    await fetch("/api/photos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });

    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...fields, bibsText: fields.bibs ? fields.bibs.join(", ") : r.bibsText, saving: false, saved: true } : r))
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

  async function deletePhoto(id: string) {
    if (!window.confirm("Delete this photo? This removes the files and can't be undone.")) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, deleting: true } : r)));
    await fetch(`/api/photos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setRows((prev) => prev.filter((r) => r.id !== id));
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
              value={uploadDay}
              onChange={(e) => setUploadDay(e.target.value)}
              placeholder="e.g. Sun, Aug 25"
              className="rounded-md border border-ink/15 bg-page px-3 py-2 text-sm outline-none focus:border-blue"
            />
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
        <div className="flex shrink-0 gap-2">
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
            <button
              type="button"
              onClick={() => setInspecting(i)}
              aria-label={`View ${row.title} full size`}
              className="group relative h-16 w-24 shrink-0 overflow-hidden rounded bg-card"
            >
              <Image
                src={`/photos/thumb/${row.id}.jpg`}
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
        />
      )}
    </div>
  );
}
