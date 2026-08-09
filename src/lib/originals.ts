import { promises as fs } from "node:fs";
import path from "node:path";
import { slugifyFilename } from "./serverImage";

// Originals live outside the app so they're never served as static files —
// the only ways out are the admin viewer (downscaled) and a paid download.
export const MEDIA_DIR = path.join(process.cwd(), "..", "Media");
export const UPLOADS_DIR = path.join(MEDIA_DIR, "uploads");

const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?|heic)$/i;

// The two naming rules that produced today's ids: the upload path's slugify,
// and scripts/process-photos.mjs's "strip extension, drop ' (1)', lowercase".
function candidateIds(filename: string): string[] {
  const legacy = filename
    .replace(/\.[^./]+$/, "")
    .replace(/\s*\(\d+\)/, "")
    .toLowerCase();
  return [slugifyFilename(filename, new Set()), legacy];
}

async function listImages(dir: string): Promise<string[]> {
  try {
    const names = await fs.readdir(dir);
    return names.filter((n) => IMAGE_EXT.test(n));
  } catch {
    return [];
  }
}

// Only ever returns a path we discovered by listing a known directory, so a
// crafted `id` can't be used to read arbitrary files.
//
// `turbopackIgnore` stops the build's static analysis from giving up on this
// path and tracing the entire project into the server bundle (public/ and all).
// MEDIA_DIR is resolved at runtime and lives outside the project, so there is
// nothing here for the build to trace in the first place.
export async function findOriginal(id: string): Promise<string | null> {
  for (const dir of [UPLOADS_DIR, MEDIA_DIR]) {
    for (const name of await listImages(dir)) {
      if (candidateIds(name).includes(id)) {
        return path.join(/*turbopackIgnore: true*/ dir, name);
      }
    }
  }
  return null;
}
