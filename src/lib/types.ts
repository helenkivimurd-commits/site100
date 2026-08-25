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
  /**
   * Someone else in this photo whose number could not be read. A photo can
   * have a bib AND an unidentified runner — two people in frame, one number
   * legible — and the second person has to be able to find themselves too, so
   * the photo belongs in the unreadable album as well as under its number.
   */
  alsoNoBib?: boolean;
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
