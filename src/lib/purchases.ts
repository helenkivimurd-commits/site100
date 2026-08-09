// Remembers which orders this browser has bought, so the customer can close
// the success page and still get back to their downloads from any page.
//
// Only the Stripe session id is kept here — never the download token. The token
// stays server-side and is handed out by /api/order, which re-checks with
// Stripe that the order was actually paid.

const STORAGE_KEY = "hkp-purchases";

export type SavedPurchase = { sessionId: string; savedAt: string };

export function loadPurchases(): SavedPurchase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SavedPurchase => p && typeof p === "object" && typeof p.sessionId === "string"
    );
  } catch {
    return [];
  }
}

export function savePurchase(sessionId: string): void {
  if (typeof window === "undefined") return;
  const existing = loadPurchases();
  if (existing.some((p) => p.sessionId === sessionId)) return;
  // Newest first — most people want the order they just placed.
  const next = [{ sessionId, savedAt: new Date().toISOString() }, ...existing];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota — downloads still work from this page.
  }
}

export function forgetPurchase(sessionId: string): void {
  if (typeof window === "undefined") return;
  const next = loadPurchases().filter((p) => p.sessionId !== sessionId);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
