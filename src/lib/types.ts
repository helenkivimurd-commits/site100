export type Discipline = "Swim" | "Bike" | "Run" | "Finish" | "Transition" | "Crowd";

export const DISCIPLINES: Discipline[] = [
  "Swim",
  "Bike",
  "Run",
  "Transition",
  "Finish",
  "Crowd",
];

// Shape stored in the catalogue (see CATALOGUE_FILE in src/lib/storage.ts),
// keyed by photo id.
export type StoredPhoto = {
  title: string;
  event: string;
  day: string;
  discipline: Discipline;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  bibs: string[];
  reviewed: boolean;
};

// What the rest of the app works with — StoredPhoto plus its id (the map
// key) and price (computed from src/lib/pricing.ts, not stored per-photo).
export type Photo = StoredPhoto & {
  id: string;
  price: number;
};

export type CartItem = {
  photoId: string;
  price: number;
};
