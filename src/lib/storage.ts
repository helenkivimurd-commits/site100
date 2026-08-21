import { promises as fs } from "node:fs";
import path from "node:path";
import type { StoredPhoto } from "./types";

// Where the two pieces of live data sit: the catalogue, and the watermarked
// renders the gallery serves.
//
// On the server these MUST point outside /srv/hkp/site, because that directory
// is a git working tree that `git pull` runs in. When the data lived inside it:
//
//   - the renders were untracked, so `git clean -fd` deleted all 254 of them
//     and left the catalogue behind, pointing at images that no longer existed;
//   - the catalogue was *tracked* and permanently modified, so `git pull`
//     conflicted on it, and every usual way out of that (`checkout .`,
//     `reset --hard`, `stash`) resets it to the committed `{}` — every bib
//     number and event gone.
//
// Both have now happened, so neither path is derived from the repo any more.
// The defaults keep a local checkout working with no configuration; the server
// sets CATALOGUE_FILE and RENDERS_DIR in .env.local.
export const CATALOGUE_FILE = process.env.CATALOGUE_FILE
  ? path.resolve(process.env.CATALOGUE_FILE)
  : path.join(process.cwd(), "src", "data", "photos.json");

export const RENDERS_DIR = process.env.RENDERS_DIR
  ? path.resolve(process.env.RENDERS_DIR)
  : path.join(process.cwd(), "public", "photos");

export const PREVIEW_DIR = path.join(RENDERS_DIR, "preview");
export const THUMB_DIR = path.join(RENDERS_DIR, "thumb");

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === "ENOENT";
}

// Always hits the disk. Every read-modify-write cycle has to start from the
// real file, or two uploads could each write back a copy of the catalogue as
// it was before the other one added to it.
export async function readCatalogue(): Promise<Record<string, StoredPhoto>> {
  try {
    return JSON.parse(await fs.readFile(CATALOGUE_FILE, "utf-8"));
  } catch (err) {
    // A server that has never had an upload has no catalogue file yet. That is
    // an empty shop, not a broken one.
    if (isMissing(err)) return {};
    throw err;
  }
}

// The whole catalogue is rewritten every time a single photo is uploaded, so
// during a bulk upload this runs thousands of times in a row. A plain
// writeFile truncates the target first, which leaves a window — small, but
// entered thousands of times — where a crash or a `systemctl restart` leaves a
// half-written file and the entire catalogue is lost.
//
// Writing to a temp file in the same directory and renaming over the target
// closes that window: rename(2) is atomic within a filesystem, so a reader
// sees either the whole old catalogue or the whole new one. The fsync before
// the rename is what makes that true after a power cut too, rather than only
// after a process crash.
export async function writeCatalogue(data: Record<string, StoredPhoto>): Promise<void> {
  await fs.mkdir(path.dirname(CATALOGUE_FILE), { recursive: true });

  const body = JSON.stringify(data, null, 2) + "\n";
  const tmp = `${CATALOGUE_FILE}.${process.pid}.tmp`;

  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(body, "utf-8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  await fs.rename(tmp, CATALOGUE_FILE);
  cache = null;
}

// The public pages read the catalogue on every request now, rather than having
// it compiled into the bundle. Re-parsing ~800 KB of JSON per request would be
// wasteful, so parse once and reuse until the file actually changes. Keyed on
// mtime and size together, because mtime alone has coarse enough resolution
// that two writes in the same millisecond could look identical.
let cache: { key: string; data: Record<string, StoredPhoto> } | null = null;

export async function readCatalogueCached(): Promise<Record<string, StoredPhoto>> {
  let key: string;
  try {
    const stat = await fs.stat(CATALOGUE_FILE);
    key = `${stat.mtimeMs}:${stat.size}`;
  } catch (err) {
    if (isMissing(err)) return {};
    throw err;
  }

  if (cache && cache.key === key) return cache.data;

  const data = await readCatalogue();
  cache = { key, data };
  return data;
}
