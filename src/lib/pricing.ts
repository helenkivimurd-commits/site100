// The one place to set prices. Everything else (photo cards, cart, checkout,
// the homepage Pricing section) reads from here — change a number here and
// it updates everywhere automatically.

// Price for a single photo, full price.
export const SINGLE_PRICE = 5;

// Buy 5 or more photos and every photo in the basket drops to this % off.
// (5 photos x €4 = €20 — a "bundle of 5 for €20" works out to a 20% per-photo discount.)
export const BUNDLE_5_THRESHOLD = 5;
export const BUNDLE_5_DISCOUNT = 0.2; // 20% off

// Buy 10 or more and get this bigger discount instead (replaces the 5+ rate).
// (10 photos x €3 = €30 — a "bundle of 10 for €30" works out to a 40% per-photo discount.)
export const BUNDLE_10_THRESHOLD = 10;
export const BUNDLE_10_DISCOUNT = 0.4; // 40% off

export function bundleDiscountFor(count: number): number {
  if (count >= BUNDLE_10_THRESHOLD) return BUNDLE_10_DISCOUNT;
  if (count >= BUNDLE_5_THRESHOLD) return BUNDLE_5_DISCOUNT;
  return 0;
}

export function pricePerPhotoAt(count: number): number {
  return SINGLE_PRICE * (1 - bundleDiscountFor(count));
}

// Total price for buying exactly `count` photos at that tier's rate —
// e.g. bundleTotalAt(BUNDLE_5_THRESHOLD) is what "5 photos for €X" costs.
export function bundleTotalAt(count: number): number {
  return count * pricePerPhotoAt(count);
}

export type BundleTier = "none" | "bundle5" | "bundle10";

export function bundleTierFor(count: number): BundleTier {
  if (count >= BUNDLE_10_THRESHOLD) return "bundle10";
  if (count >= BUNDLE_5_THRESHOLD) return "bundle5";
  return "none";
}

export function bundleLabel(tier: BundleTier): string {
  if (tier === "bundle10") return `Bundle -${BUNDLE_10_DISCOUNT * 100}%`;
  if (tier === "bundle5") return `Bundle -${BUNDLE_5_DISCOUNT * 100}%`;
  return "";
}

export function bundleSubLabel(tier: BundleTier): string {
  if (tier === "bundle10") return `${BUNDLE_10_THRESHOLD}+ photos`;
  if (tier === "bundle5") return `${BUNDLE_5_THRESHOLD}-${BUNDLE_10_THRESHOLD - 1} photos`;
  return "";
}
