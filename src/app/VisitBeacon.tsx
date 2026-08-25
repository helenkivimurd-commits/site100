"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Tells the server a page was opened. Sits in the root layout so it covers
// every page, including the ones served as static HTML that cannot count
// themselves.
//
// It sends the path and which site the visitor came from. No cookie, no
// identifier, nothing kept in the browser.
export default function VisitBeacon() {
  const pathname = usePathname();
  // React mounts twice in development, and moving between pages must not
  // re-count the one just left. Remembering the last path sent covers both.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || sent.current === pathname) return;
    if (pathname.startsWith("/admin")) return;
    sent.current = pathname;

    const body = JSON.stringify({ path: pathname, ref: document.referrer || null });
    // keepalive so the count still arrives when the page is being left.
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // A visitor who cannot be counted is still a visitor. Never let this
      // surface as an error in their console.
    });
  }, [pathname]);

  return null;
}
