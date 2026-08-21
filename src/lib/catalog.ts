import type { Photo, StoredPhoto } from "./types";
import { readCatalogueCached } from "./storage";
import { SINGLE_PRICE } from "./pricing";

// The catalogue is read from disk per request rather than imported as a module.
//
// It used to be `import photosData from "@/data/photos.json"`, which inlines
// the file into the bundle at build time. That meant a photo uploaded through
// /admin did not exist as far as the public site was concerned — not in the
// gallery, and not to /api/checkout either, so it could not even be bought —
// until someone remembered to run `npm run build` again. Reading at runtime is
// what lets an upload show up on the site straight away.
//
// storage.ts caches the parse and only re-reads when the file actually changes,
// so this costs a stat() per request, not a full JSON parse.
function toPhotos(stored: Record<string, StoredPhoto>): Photo[] {
  // JS preserves string-key insertion order, so the catalogue's own order is
  // the display order.
  return Object.entries(stored).map(([id, meta]) => ({
    id,
    ...meta,
    price: SINGLE_PRICE,
  }));
}

export async function getPhotos(): Promise<Photo[]> {
  return toPhotos(await readCatalogueCached());
}

export async function getPhoto(id: string): Promise<Photo | undefined> {
  const stored = await readCatalogueCached();
  const meta = stored[id];
  return meta ? { id, ...meta, price: SINGLE_PRICE } : undefined;
}

// Looking several photos up at once — an order, a basket — should read the
// catalogue once rather than per id.
export async function getPhotoMap(): Promise<Map<string, Photo>> {
  return new Map((await getPhotos()).map((photo) => [photo.id, photo]));
}
