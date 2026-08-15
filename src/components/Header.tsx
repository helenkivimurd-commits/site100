"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useCart } from "./CartProvider";
import { loadPurchases } from "@/lib/purchases";
import CartDrawer from "./CartDrawer";

export default function Header() {
  const { count, openDrawer } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

  // Only shown once this browser has bought something, so first-time visitors
  // aren't offered an empty page. Read after mount — localStorage doesn't
  // exist during SSR, and rendering it server-side would cause a mismatch.
  const [hasPurchases, setHasPurchases] = useState(false);
  useEffect(() => {
    // Same one-shot hydration pattern as CartProvider: localStorage doesn't
    // exist during SSR, so this can't be a lazy useState initializer without
    // causing a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasPurchases(loadPurchases().length > 0);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-card bg-page/95 backdrop-blur supports-[backdrop-filter]:bg-page/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2 sm:px-8">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image
              src="/images/logo-ink.png"
              alt="h_kivimurd Photography"
              width={225}
              height={115}
              className="h-11 w-auto sm:h-16"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-8 font-mono text-sm uppercase tracking-wide text-ink md:flex">
            <Link href="/#find" className="transition-colors hover:text-blue">
              Find my bib
            </Link>
            <Link href="/gallery" className="transition-colors hover:text-blue">
              All photos
            </Link>
            <Link href="/#pricing" className="transition-colors hover:text-blue">
              Pricing
            </Link>
            <Link href="/about" className="transition-colors hover:text-blue">
              About
            </Link>
            {hasPurchases && (
              <Link href="/downloads" className="text-blue transition-colors hover:text-blue-hover">
                My photos
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openDrawer}
              className="relative flex items-center gap-2 rounded-full border border-ink/15 px-3 py-2 font-mono text-sm transition-colors hover:border-blue hover:text-blue"
              aria-label={`Open basket, ${count} photo${count === 1 ? "" : "s"}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 8h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 8Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <span className="hidden sm:inline">Basket</span>
              {count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue px-1 text-xs font-semibold text-white">
                  {count}
                </span>
              )}
            </button>

            <button
              type="button"
              className="flex items-center justify-center rounded-full border border-ink/15 p-2 md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-card px-5 py-3 font-mono text-sm uppercase tracking-wide md:hidden">
            <Link href="/#find" className="py-2" onClick={() => setMenuOpen(false)}>
              Find my bib
            </Link>
            <Link href="/gallery" className="py-2" onClick={() => setMenuOpen(false)}>
              All photos
            </Link>
            <Link href="/#pricing" className="py-2" onClick={() => setMenuOpen(false)}>
              Pricing
            </Link>
            <Link href="/about" className="py-2" onClick={() => setMenuOpen(false)}>
              About
            </Link>
            {hasPurchases && (
              <Link
                href="/downloads"
                className="py-2 text-blue"
                onClick={() => setMenuOpen(false)}
              >
                My photos
              </Link>
            )}
          </nav>
        )}
      </header>
      <CartDrawer />
    </>
  );
}
