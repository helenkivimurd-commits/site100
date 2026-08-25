import { headers } from "next/headers";
import GalleryClient from "./GalleryClient";
import { getPhotos } from "@/lib/catalog";
import { browse } from "@/lib/browse";
import { record, referrerName, visitorHash } from "@/lib/analytics";

// The catalogue is read per request, so a photo uploaded through /admin is
// in the gallery immediately instead of waiting for the next build.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "All photos — h_kivimurd Photography",
};

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ bib?: string; event?: string; discipline?: string; nobib?: string }>;
}) {
  const { bib, event, discipline, nobib } = await searchParams;
  const photos = await getPhotos();

  // Which of the three levels this is — events, disciplines, or photos — is
  // decided here so that only what the level needs crosses to the browser.
  // Opening one discipline sends that discipline, not the whole catalogue.
  const view = browse(photos, { event, discipline, bib, noBib: nobib === "1" });

  // Recorded here rather than in the browser because this is the number that
  // matters most: a search that finds nothing is a runner who leaves without
  // buying, and often a photo tagged wrong. An ad blocker must not be able to
  // hide that, and neither should a page served from cache.
  if (bib && bib.trim()) {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip")?.trim() || "unknown";
    await record({
      k: "search",
      q: bib.trim().slice(0, 12),
      n: view.kind === "search" ? view.photos.length : 0,
      r: referrerName(h.get("referer"), h.get("host") ?? ""),
      v: await visitorHash(ip, h.get("user-agent") ?? ""),
    });
  }

  return <GalleryClient view={view} initialBib={bib ?? ""} />;
}
