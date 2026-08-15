// Deliberately its own file with no data imports: this is used by client
// components, and pulling it out of catalog.ts would drag photos.json into
// their bundles.

type Titled = { title: string; id: string; bibs: string[]; day: string };

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// A freshly uploaded photo gets its filename as the title ("DSC01234"), which
// is no more useful to a customer than the id itself. Only a title the
// photographer actually wrote is worth showing.
export function realTitle(photo: { title: string; id: string }): string | null {
  const title = photo.title?.trim();
  if (!title) return null;
  return normalise(title) === normalise(photo.id) ? null : title;
}

// What to call a photo on screen, best available first: the photographer's
// title, then the bib number, then the day it was taken. Never the raw id —
// "DSC00330" means nothing to the person deciding whether to buy it.
export function photoLabel(photo: Titled): string {
  const title = realTitle(photo);
  if (title) return title;
  if (photo.bibs.length > 0) return `Bib ${photo.bibs.join(" / ")}`;
  return photo.day || photo.id.toUpperCase();
}

// Once a photo is in the basket the ordering flips: the bib answers "which
// picture of me is this?", which matters more there than the title does.
export function purchaseLabel(photo: Titled): string {
  if (photo.bibs.length > 0) return `Bib ${photo.bibs.join(" / ")}`;
  return realTitle(photo) ?? (photo.day || photo.id.toUpperCase());
}
