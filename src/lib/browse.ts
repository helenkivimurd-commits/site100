import type { Photo } from "./types.ts";
import { matchBibs, comparePartials } from "./bibMatch.ts";

// The gallery browses like folders: events first, then the disciplines inside
// the chosen event, then the photos. This works out which of those three the
// page is showing and gathers only what that view needs.
//
// Doing it here, on the server, rather than shipping the whole catalogue to the
// browser and filtering there, is what lets the gallery hold thousands of
// photos: opening one discipline sends that discipline, not the catalogue.

export type Folder = {
  name: string;
  count: number;
  /** Photo whose thumbnail stands in for the folder. */
  cover: Photo | null;
  /** The gathered "bib not visible" album rather than a real discipline. */
  noBib?: true;
};

/** The album's name wherever it is shown. */
export const NO_BIB_ALBUM = "No bib visible";

/**
 * Photos the photographer looked at and marked as having no readable bib —
 * reviewed, but with no number recorded. Not the same as a photo nobody has
 * got to yet, which simply has no bib recorded so far.
 */
export function hasNoVisibleBib(photo: Photo): boolean {
  if (!photo.reviewed) return false;
  // Nobody in the photo could be identified, or somebody in it could not be
  // even though somebody else could. Either way there is a runner here who
  // will never find themselves by typing a number.
  return photo.bibs.length === 0 || photo.alsoNoBib === true;
}

// Which events hold unreadable photos, biggest first. Used to offer a runner
// whose search came up empty a choice of race rather than one undifferentiated
// heap — they know which one they ran.
function noBibByEvent(photos: Photo[]): { event: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    if (!hasNoVisibleBib(photo)) continue;
    const name = (photo.event ?? "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count || a.event.localeCompare(b.event));
}

export type BrowseView =
  /** No event chosen: the list of events. */
  | { kind: "events"; folders: Folder[] }
  /** An event chosen: the disciplines inside it. */
  | { kind: "disciplines"; event: string; folders: Folder[] }
  /** Both chosen: the photos themselves. */
  | { kind: "photos"; event: string; discipline: string; photos: Photo[] }
  /**
   * A bib typed at a level above the photos. Searches whatever is in scope:
   * everything at the top, or just the chosen event once inside one.
   */
  | {
      kind: "search";
      bib: string;
      event?: string;
      photos: Photo[];
      maybes: Photo[];
      /**
       * Where the unreadable photos are, one entry per event. A search that
       * found nothing offers these by name: every event's album is called the
       * same thing, so sending someone to a combined pile of all of them would
       * mean scrolling two races they were never in.
       */
      noBibByEvent: { event: string; count: number }[];
    }
  /**
   * The gathered album of photos whose bib could not be read. Cuts across the
   * disciplines rather than replacing them: a run photo with an unreadable bib
   * is still in Run, and is here too, so that browsing Run misses nothing and
   * a runner who searched and found nothing has one place to look.
   */
  /**
   * The unreadable-bib albums, one per event. Reached from the button offered
   * when a search finds nothing: every album is called the same thing, so the
   * choice has to be made by race before any photos are shown.
   */
  | { kind: "nobibFolders"; folders: Folder[] }
  | {
      kind: "nobib";
      event?: string;
      discipline?: string;
      photos: Photo[];
      /** Disciplines present in this album, for narrowing it further. */
      disciplines: { name: string; count: number }[];
    }
  /** An event or discipline in the URL that no photo actually uses. */
  | { kind: "empty"; event?: string; discipline?: string };

// Folders are ordered by how many photos they hold, so the big shoot from a
// race weekend is the first thing on the page rather than a stray test upload.
function foldersBy(photos: Photo[], key: "event" | "discipline"): Folder[] {
  const groups = new Map<string, Photo[]>();
  for (const photo of photos) {
    const name = (photo[key] ?? "").trim();
    if (!name) continue;
    const group = groups.get(name);
    if (group) group.push(photo);
    else groups.set(name, [photo]);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, count: list.length, cover: list[0] ?? null }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Splits photos into confident bib matches and the "might be you" suggestions,
 * the same way the gallery has always presented them.
 */
export function splitByBib(photos: Photo[], bib: string) {
  const confident: Photo[] = [];
  const partial: { photo: Photo; visible: number; contiguous: boolean }[] = [];

  for (const photo of photos) {
    const match = matchBibs(bib, photo.bibs);
    if (!match) continue;
    if (match.kind === "partial") {
      partial.push({ photo, visible: match.visible, contiguous: match.contiguous });
    } else {
      confident.push(photo);
    }
  }

  partial.sort(comparePartials);
  return { photos: confident, maybes: partial.map((p) => p.photo) };
}

export function browse(
  all: Photo[],
  {
    event,
    discipline,
    bib,
    noBib,
  }: { event?: string; discipline?: string; bib?: string; noBib?: boolean }
): BrowseView {
  const query = (bib ?? "").trim();

  // The gathered album, either for one event or across all of them. Reached
  // from its own tile, and from the button offered when a search finds nothing.
  if (noBib && !event) {
    // No race chosen yet: offer the albums rather than merging them, so nobody
    // scrolls two races they were never in.
    const unreadable = all.filter(hasNoVisibleBib);
    const byEvent = new Map<string, Photo[]>();
    for (const photo of unreadable) {
      const name = (photo.event ?? "").trim();
      if (!name) continue;
      const group = byEvent.get(name);
      if (group) group.push(photo);
      else byEvent.set(name, [photo]);
    }
    return {
      kind: "nobibFolders",
      folders: [...byEvent.entries()]
        .map(([name, list]) => ({ name, count: list.length, cover: list[0] ?? null, noBib: true as const }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  }

  if (noBib) {
    const scope = all.filter((p) => p.event === event);
    const unreadable = scope.filter(hasNoVisibleBib);

    // An Ironman's worth of unreadable photos is a long scroll. Someone who
    // only swam knows that, so the disciplines inside are offered as a filter.
    const disciplines = [...new Map<string, number>(
      unreadable.reduce((acc, p) => {
        const name = (p.discipline ?? "").trim();
        if (name) acc.set(name, (acc.get(name) ?? 0) + 1);
        return acc;
      }, new Map<string, number>())
    ).entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return {
      kind: "nobib",
      event,
      discipline,
      photos: discipline ? unreadable.filter((p) => p.discipline === discipline) : unreadable,
      disciplines,
    };
  }

  // A bib typed before any event is chosen searches the whole catalogue and
  // goes straight to the results. Someone who knows their number should never
  // have to work out which event they were in first — and a runner who did two
  // races sees both without searching twice.
  if (query && !event) {
    return { kind: "search", bib: query, ...splitByBib(all, query), noBibByEvent: noBibByEvent(all) };
  }

  if (!event) return { kind: "events", folders: foldersBy(all, "event") };

  const inEvent = all.filter((p) => p.event === event);
  if (inEvent.length === 0) return { kind: "empty", event };

  // Typed from inside an event but before an album: search that event only.
  // Once you have said which race you were in, the search respects it.
  if (query && !discipline) {
    return {
      kind: "search",
      bib: query,
      event,
      ...splitByBib(inEvent, query),
      noBibByEvent: noBibByEvent(inEvent),
    };
  }

  if (!discipline) {
    const folders = foldersBy(inEvent, "discipline");
    // Listed after the real disciplines, because it is where you look when the
    // ordinary route has not worked rather than a place to start.
    const unreadable = inEvent.filter(hasNoVisibleBib);
    if (unreadable.length > 0) {
      folders.push({
        name: NO_BIB_ALBUM,
        count: unreadable.length,
        cover: unreadable[0] ?? null,
        noBib: true,
      });
    }
    return { kind: "disciplines", event, folders };
  }

  const inDiscipline = inEvent.filter((p) => p.discipline === discipline);
  if (inDiscipline.length === 0) return { kind: "empty", event, discipline };

  return { kind: "photos", event, discipline, photos: inDiscipline };
}
