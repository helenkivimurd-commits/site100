"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { purchaseLabel } from "@/lib/photoTitle";
import { loadPurchases, forgetPurchase } from "@/lib/purchases";

type OrderPhoto = { id: string; title: string; bibs: string[]; day: string; url: string };
type LoadedOrder = {
  sessionId: string;
  amountTotal: number;
  expiresAt: string;
  photos: OrderPhoto[];
};

export default function DownloadsPage() {
  const [orders, setOrders] = useState<LoadedOrder[] | null>(null);
  // A link that was sent to someone carries its own token. Their browser was
  // never at the checkout and remembers nothing, so the token is the only thing
  // that can say which photos are theirs — and it shows those alone, not
  // whatever else this browser happens to remember buying.
  const [sentLink, setSentLink] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token =
        typeof window === "undefined"
          ? null
          : new URLSearchParams(window.location.search).get("token");

      if (token) {
        setSentLink(true);
        try {
          const res = await fetch(`/api/order?token=${encodeURIComponent(token)}`);
          const body = res.ok ? await res.json() : null;
          if (!cancelled) {
            setOrders(body && body.status === "paid" ? [{ sessionId: token, ...body }] : []);
          }
        } catch {
          if (!cancelled) setOrders([]);
        }
        return;
      }

      const saved = loadPurchases();
      const loaded: LoadedOrder[] = [];

      for (const { sessionId } of saved) {
        try {
          const res = await fetch(`/api/order?session_id=${encodeURIComponent(sessionId)}`);
          if (res.status === 404) {
            // The order record is gone from the server — stop showing it.
            forgetPurchase(sessionId);
            continue;
          }
          if (!res.ok) continue;
          const body = await res.json();
          if (body.status !== "paid") continue;
          loaded.push({ sessionId, ...body });
        } catch {
          // Offline or the server is down — just skip this one for now.
        }
      }

      if (!cancelled) setOrders(loaded);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (orders === null) {
    return (
      <Shell>
        <p className="font-mono text-sm text-muted">Looking up your orders…</p>
      </Shell>
    );
  }

  if (orders.length === 0) {
    return (
      <Shell>
        <p className="text-sm text-muted">
          {sentLink
            ? "This link isn't valid any more. Links last 30 days — ask whoever sent it for a new one."
            : "No purchases found on this device. Download links are remembered per browser — if you bought on your phone, open this page there, or use the links in your confirmation email."}
        </p>
        <Link
          href="/gallery"
          className="mt-2 rounded-full bg-blue px-6 py-3 font-mono text-sm uppercase tracking-wide text-white transition-colors hover:bg-blue-hover"
        >
          Browse photos
        </Link>
      </Shell>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">
        {sentLink ? "Shared with you" : "Your purchases"}
      </p>
      <h1 className="mt-3 font-display text-4xl uppercase tracking-wide sm:text-5xl">
        {sentLink ? "Your photos" : "My photos"}
      </h1>
      <p className="mt-3 text-sm text-muted">
        {sentLink
          ? "Full resolution, no watermark — exactly as they came out of the camera."
          : "Everything you've bought in this browser. Full resolution, no watermark."}
      </p>

      {orders.map((order) => (
        <section key={order.sessionId} className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-card pb-2">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
              {order.photos.length} photo{order.photos.length === 1 ? "" : "s"}
              {order.amountTotal > 0 ? ` · ${formatMoney(order.amountTotal / 100)}` : ""}
            </h2>
            <span className="font-mono text-xs text-muted">
              Links expire{" "}
              {new Date(order.expiresAt).toLocaleDateString("en-IE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>

          <ul className="divide-y divide-card">
            {order.photos.map((photo) => (
              <li key={photo.id} className="flex items-center gap-4 py-4">
                <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded bg-card">
                  <Image
                    src={`/api/photo/thumb/${photo.id}`}
                    alt={photo.bibs.length > 0 ? `Bib ${photo.bibs.join(", ")}` : photo.id}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{purchaseLabel(photo)}</p>
                  <p className="font-mono text-xs text-muted">{photo.day}</p>
                </div>
                <a
                  href={photo.url}
                  className="shrink-0 rounded-full bg-blue px-5 py-2.5 font-mono text-xs uppercase tracking-wide text-white transition-colors hover:bg-blue-hover"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Link
        href="/gallery"
        className="mt-12 inline-block font-mono text-sm uppercase tracking-wide text-blue hover:text-blue-hover"
      >
        ← Browse more photos
      </Link>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-5 py-24 text-center sm:px-8">
      <h1 className="font-display text-4xl uppercase tracking-wide">My photos</h1>
      {children}
    </div>
  );
}
