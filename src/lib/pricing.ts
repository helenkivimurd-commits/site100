// The one place to set prices. Everything else (photo cards, cart, checkout,
// the homepage Pricing section) reads from here — change a number here and
// it updates everywhere automatically.

// Price for a single photo, full price.
export const SINGLE_PRICE = 5;

// Buy this many or more and every photo in the basket drops by BUNDLE_DISCOUNT.
// (3 photos x €4 = €12 — "a bundle of 3 for €12" is a 20% per-photo discount.
// The €4 rate carries on above three, so 5 photos are €20, 10 are €40.)
export const BUNDLE_THRESHOLD = 3;
export const BUNDLE_DISCOUNT = 0.2; // 20% off

export function bundleDiscountFor(count: number): number {
  return count >= BUNDLE_THRESHOLD ? BUNDLE_DISCOUNT : 0;
}

export function pricePerPhotoAt(count: number): number {
  return SINGLE_PRICE * (1 - bundleDiscountFor(count));
}

// Total price for buying exactly `count` photos at that tier's rate —
// e.g. bundleTotalAt(BUNDLE_THRESHOLD) is what "3 photos for €X" costs.
export function bundleTotalAt(count: number): number {
  return count * pricePerPhotoAt(count);
}

export type BundleTier = "none" | "bundle";

export function bundleTierFor(count: number): BundleTier {
  return count >= BUNDLE_THRESHOLD ? "bundle" : "none";
}

export function bundleLabel(tier: BundleTier): string {
  return tier === "bundle" ? `Bundle -${BUNDLE_DISCOUNT * 100}%` : "";
}

export function bundleSubLabel(tier: BundleTier): string {
  return tier === "bundle" ? `${BUNDLE_THRESHOLD}+ photos` : "";
}
