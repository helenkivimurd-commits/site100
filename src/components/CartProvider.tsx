"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { bundleDiscountFor, bundleTierFor, type BundleTier } from "@/lib/pricing";

const STORAGE_KEY = "hkp-basket";

// The basket stores what it needs to render itself rather than looking each
// photo up in the catalog. That keeps the catalog (and its photos.json import)
// out of the layout's module graph, so saving from /admin doesn't rebuild and
// reload every page — and it means a basket survives a photo being retitled.
export type CartItem = {
  id: string;
  title: string;
  day: string;
  bibs: string[];
  price: number;
};

// Type-only import, so this file still pulls in no catalog data.
export function toCartItem(photo: {
  id: string;
  title: string;
  day: string;
  bibs: string[];
  price: number;
}): CartItem {
  return {
    id: photo.id,
    title: photo.title,
    day: photo.day,
    bibs: photo.bibs,
    price: photo.price,
  };
}

type CartContextValue = {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (photoId: string) => void;
  has: (photoId: string) => boolean;
  clear: () => void;
  count: number;
  subtotal: number;
  discount: number;
  total: number;
  discountRate: number;
  bundleTier: BundleTier;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // One-time hydration from localStorage on mount — window isn't available during SSR,
      // so this can't be a lazy useState initializer without a hydration mismatch.
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ignore baskets saved by the older id-only format.
        if (Array.isArray(parsed) && parsed.every((i) => i && typeof i === "object")) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setItems(parsed);
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const add = useCallback((item: CartItem) => {
    setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
    setDrawerOpen(true);
  }, []);

  const remove = useCallback((photoId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== photoId));
  }, []);

  const has = useCallback((photoId: string) => items.some((i) => i.id === photoId), [items]);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((sum, i) => sum + i.price, 0);
    const discountRate = bundleDiscountFor(items.length);
    const discount = subtotal * discountRate;
    const bundleTier = bundleTierFor(items.length);
    return {
      items,
      add,
      remove,
      has,
      clear,
      count: items.length,
      subtotal,
      discount,
      total: subtotal - discount,
      discountRate,
      bundleTier,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    };
  }, [items, add, remove, has, clear, drawerOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
