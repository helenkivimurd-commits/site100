"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import PhotoGrid from "@/components/PhotoGrid";
import type { Photo } from "@/lib/types";
import type { BrowseView, Folder } from "@/lib/browse";
import { splitByBib, NO_BIB_ALBUM } from "@/lib/browse";

// The gallery browses like folders: events, then the disciplines inside the
// chosen one, then the photos. Which level is showing was decided on the
// server; this renders it and handles the bib box.
//
// The bib box means two different things depending on where you are, which is
// deliberate. At the top it searches the whole catalogue and jumps straight to
// the results — somebody who knows their number should never have to work out
// which event they were in first. Inside a folder it narrows that folder as you
// type, because by then you have already said which photos you mean.
export default function GalleryClient({
  view,
  initialBib,
}: {
  view: BrowseView;
  initialBib: string;
}) {
  const router = useRouter();
  const [bib, setBib] = useState(initialBib);

  const insideFolder = view.kind === "photos" || view.kind === "nobib";

  // Inside a folder the filtering is instant, over photos the browser already
  // holds. At the top level there is nothing here to filter — the whole
  // catalogue is deliberately not sent — so submitting navigates instead and
  // the server does the search.
  const filtered = useMemo(() => {
    if (view.kind === "search") return { photos: view.photos, maybes: view.maybes };
    if (view.kind !== "photos" && view.kind !== "nobib") {
      return { photos: [] as Photo[], maybes: [] as Photo[] };
    }
    if (!bib.trim()) return { photos: view.photos, maybes: [] as Photo[] };
    return splitByBib(view.photos, bib.trim());
  }, [view, bib]);

  // Whichever event is currently open stays open when a bib is submitted, so
  // searching from inside a race searches that race and not the whole shop.
  const scopeEvent =
    view.kind === "disciplines" || view.kind === "search" || view.kind === "nobib"
      ? view.event
      : undefined;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (insideFolder) return; // already filtering as she types
    const params = new URLSearchParams();
    if (scopeEvent) params.set("event", scopeEvent);
    const q = bib.trim();
    if (q) params.set("bib", q);
    router.push(params.toString() ? `/gallery?${params}` : "/gallery");
  }

  function clearBib() {
    setBib("");
    if (view.kind !== "search") return;
    router.push(view.event ? `/gallery?event=${encodeURIComponent(view.event)}` : "/gallery");
  }

  const { title, subtitle } = heading(view, filtered.photos.length, bib);

  return (
    <div>
      <div className="sticky top-[73px] z-30 border-b border-card bg-page/95 backdrop-blur sm:top-[81px]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <Breadcrumb view={view} />
            <h1 className="truncate font-display text-3xl uppercase tracking-wide sm:text-4xl">
              {title}
            </h1>
            <p className="font-mono text-xs text-muted">{subtitle}</p>
          </div>

          <form
            onSubmit={onSubmit}
            className="flex w-full max-w-md items-center gap-2 rounded-md border border-ink/15 bg-page px-3"
          >
            <span className="font-mono text-sm text-muted">#</span>
            <input
              value={bib}
              onChange={(e) => setBib(e.target.value)}
              inputMode="numeric"
              placeholder={
                insideFolder
                  ? "Filter these photos by bib"
                  : scopeEvent
                    ? `Search ${scopeEvent} by bib`
                    : "Search every photo by bib"
              }
              aria-label={
                insideFolder
                  ? "Filter these photos by bib number"
                  : scopeEvent
                    ? `Search ${scopeEvent} by bib number`
                    : "Search every photo by bib number"
              }
              className="w-full bg-transparent py-2.5 font-mono text-sm text-ink outline-none placeholder:text-muted"
            />
            {bib ? (
              <button
                type="button"
                onClick={clearBib}
                aria-label="Clear bib filter"
                className="text-muted transition-colors hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        {view.kind === "events" || view.kind === "disciplines" ? (
          view.folders.length > 0 ? (
            <FolderGrid view={view} />
          ) : (
            <Empty title="Nothing here yet" body="Photos appear here as they are added." />
          )
        ) : view.kind === "empty" ? (
          <Empty
            title="Nothing here"
            body="That album is empty, or it has been renamed."
            action={{ href: "/gallery", label: "Back to all events" }}
          />
        ) : filtered.photos.length > 0 ? (
          <>
            <PhotoGrid photos={filtered.photos} />
            {filtered.maybes.length > 0 && <MaybeSection photos={filtered.maybes} bib={bib} />}
          </>
        ) : filtered.maybes.length > 0 ? (
          <MaybeSection photos={filtered.maybes} bib={bib} soleResult />
        ) : bib.trim() ? (
          <NothingFound event={scopeEvent} />
        ) : (
          <Empty title="No photos found" body="This album is empty." />
        )}
      </div>
    </div>
  );
}

// What a runner sees when their number finds nothing. A dead end here is the
// worst moment on the site — they came to find themselves — so it explains why
// a search can come up empty and sends them somewhere rather than nowhere.
function NothingFound({ event }: { event?: string }) {
  const href = event ? `/gallery?event=${encodeURIComponent(event)}&nobib=1` : "/gallery?nobib=1";
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-20 text-center">
      <p className="font-display text-3xl uppercase tracking-wide text-muted">No photos found</p>
      <p className="text-sm leading-relaxed text-muted">
        Due to the harsh weather on the race days, a lot of bibs got damaged so the numbers
        can&rsquo;t be seen on the photo. That doesn&rsquo;t necessarily mean there isn&rsquo;t a
        photo of you. Scroll through the photos yourself, and I hope that you could find yourself.
      </p>
      <Link
        href={href}
        className="mt-1 rounded-full bg-ink px-6 py-3 font-mono text-sm uppercase tracking-wide text-white transition-colors hover:bg-ink/85"
      >
        See photos with no visible bib
      </Link>
      <Link href="/gallery" className="font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-ink">
        or browse every event
      </Link>
    </div>
  );
}

function heading(view: BrowseView, shown: number, bib: string) {
  const plural = (n: number) => `${n} photo${n === 1 ? "" : "s"}`;
  switch (view.kind) {
    case "events":
      return {
        title: "All photos",
        subtitle: `${view.folders.length} event${view.folders.length === 1 ? "" : "s"}`,
      };
    case "disciplines":
      return {
        title: view.event,
        subtitle: `${view.folders.length} album${view.folders.length === 1 ? "" : "s"}`,
      };
    case "photos":
      return {
        title: view.discipline,
        subtitle: bib.trim() ? `${plural(shown)} matching bib "${bib.trim()}"` : plural(shown),
      };
    case "search":
      return {
        title: "Search results",
        subtitle: `${plural(shown)} matching bib "${view.bib}"${view.event ? ` in ${view.event}` : " across every event"}`,
      };
    case "nobib":
      return {
        title: NO_BIB_ALBUM,
        subtitle: bib.trim() ? `${plural(shown)} matching bib "${bib.trim()}"` : plural(shown),
      };
    case "empty":
      return { title: view.discipline ?? view.event ?? "Not found", subtitle: "" };
  }
}

// Where you are, and the way back out — the folder path from a file window,
// with every step above the current one clickable.
function Breadcrumb({ view }: { view: BrowseView }) {
  if (view.kind === "events") return null;

  const crumbs: { label: string; href?: string }[] = [{ label: "All events", href: "/gallery" }];

  if (view.kind === "search") {
    if (view.event) {
      crumbs.push({ label: view.event, href: `/gallery?event=${encodeURIComponent(view.event)}` });
    }
    crumbs.push({ label: `Bib ${view.bib}` });
  } else if (view.kind === "disciplines") {
    crumbs.push({ label: view.event });
  } else if (view.kind === "nobib") {
    if (view.event) {
      crumbs.push({ label: view.event, href: `/gallery?event=${encodeURIComponent(view.event)}` });
    }
    crumbs.push({ label: NO_BIB_ALBUM });
  } else {
    const event = view.event;
    if (event) {
      crumbs.push(
        view.kind === "photos"
          ? { label: event, href: `/gallery?event=${encodeURIComponent(event)}` }
          : { label: event }
      );
    }
    if (view.discipline) crumbs.push({ label: view.discipline });
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-1 flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted"
    >
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-ink/25">/</span>}
          {c.href ? (
            <Link href={c.href} className="uppercase tracking-wide transition-colors hover:text-ink">
              {c.label}
            </Link>
          ) : (
            <span className="uppercase tracking-wide">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function FolderGrid({ view }: { view: Extract<BrowseView, { kind: "events" | "disciplines" }> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {view.folders.map((folder) => (
        <FolderTile
          key={folder.name}
          folder={folder}
          href={
            view.kind === "events"
              ? `/gallery?event=${encodeURIComponent(folder.name)}`
              : folder.noBib
                ? `/gallery?event=${encodeURIComponent(view.event)}&nobib=1`
                : `/gallery?event=${encodeURIComponent(view.event)}&discipline=${encodeURIComponent(folder.name)}`
          }
        />
      ))}
    </div>
  );
}

// A folder shows one of the photos inside it, so the choice can be made by
// looking rather than by reading a word like "Crowd" and guessing.
function FolderTile({ folder, href }: { folder: Folder; href: string }) {
  const cover = folder.cover;
  return (
    <Link href={href} className="group block focus:outline-none">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-card ring-1 ring-ink/10 transition-shadow group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-blue">
        {cover ? (
          <Image
            src={`/api/photo/thumb/${cover.id}`}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="truncate font-display text-lg uppercase leading-tight tracking-wide text-white sm:text-xl">
            {folder.name}
          </p>
          <p className="font-mono text-[11px] text-white/75">
            {folder.count} photo{folder.count === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </Link>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="font-display text-3xl uppercase tracking-wide text-muted">{title}</p>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-2 rounded-full border border-ink px-5 py-2 font-mono text-sm uppercase tracking-wide transition-colors hover:bg-ink hover:text-white"
        >
          {action.label}
        </Link>
      )}
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
