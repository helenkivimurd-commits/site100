import type { Photo, StoredPhoto } from "./types";
import photosData from "@/data/photos.json";
import { SINGLE_PRICE } from "./pricing";

// The JSON import's `discipline` is widened to `string` by TS's JSON module
// inference — cast back to the real union since /admin only ever writes valid values.
const stored = photosData as unknown as Record<string, StoredPhoto>;

// Photo data lives in src/data/photos.json — edit it through /admin, not here.
// JS preserves string-key insertion order, so photos.json's own order is the
// display order.
export const photos: Photo[] = Object.entries(stored).map(([id, meta]) => ({
  id,
  ...meta,
  price: SINGLE_PRICE,
}));

export function getPhoto(id: string): Photo | undefined {
  return photos.find((p) => p.id === id);
}

export function searchByBib(query: string): Photo[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return photos.filter((p) => p.bibs.some((b) => b.toUpperCase() === q));
}

export function searchByBibPartial(query: string): Photo[] {
  const q = query.trim().toUpperCase();
  if (!q) return photos;
  return photos.filter((p) => p.bibs.some((b) => b.toUpperCase().includes(q)));
}
