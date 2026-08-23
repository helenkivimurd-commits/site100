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
};

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
  | { kind: "search"; bib: string; event?: string; photos: Photo[]; maybes: Photo[] }
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
  { event, discipline, bib }: { event?: string; discipline?: string; bib?: string }
): BrowseView {
  const query = (bib ?? "").trim();

  // A bib typed before any event is chosen searches the whole catalogue and
  // goes straight to the results. Someone who knows their number should never
  // have to work out which event they were in first — and a runner who did two
  // races sees both without searching twice.
  if (query && !event) {
    return { kind: "search", bib: query, ...splitByBib(all, query) };
  }

  if (!event) return { kind: "events", folders: foldersBy(all, "event") };

  const inEvent = all.filter((p) => p.event === event);
  if (inEvent.length === 0) return { kind: "empty", event };

  // Typed from inside an event but before an album: search that event only.
  // Once you have said which race you were in, the search respects it.
  if (query && !discipline) {
    return { kind: "search", bib: query, event, ...splitByBib(inEvent, query) };
  }

  if (!discipline) return { kind: "disciplines", event, folders: foldersBy(inEvent, "discipline") };

  const inDiscipline = inEvent.filter((p) => p.discipline === discipline);
  if (inDiscipline.length === 0) return { kind: "empty", event, discipline };

  return { kind: "photos", event, discipline, photos: inDiscipline };
}
