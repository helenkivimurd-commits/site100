import { headers } from "next/headers";
import GalleryClient from "./GalleryClient";
import { getPhotos } from "@/lib/catalog";
import { browse } from "@/lib/browse";
import { record, referrerName, visitorHash } from "@/lib/analytics";
import { checkAdminAccess } from "@/lib/adminAuth";

// The catalogue is read per request, so a photo uploaded through /admin is
// in the gallery immediately instead of waiting for the next build.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "All photos — h_kivimurd Photography",
};

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{
    bib?: string;
    event?: string;
    discipline?: string;
    nobib?: string;
    photo?: string;
  }>;
}) {
  const { bib, event, discipline, nobib, photo } = await searchParams;
  const photos = await getPhotos();

  // Which of the three levels this is — events, disciplines, or photos — is
  // decided here so that only what the level needs crosses to the browser.
  // Opening one discipline sends that discipline, not the whole catalogue.
  const view = browse(photos, { event, discipline, bib, noBib: nobib === "1" });

  // Signed in as admin in this browser? Then each photo gets a quiet link
  // through to its row in /admin. Spotting a wrong number while browsing the
  // shop and being unable to act on it is how wrong numbers stay wrong.
  const head = await headers();
  const access = await checkAdminAccess(
    new Request("http://gallery.local", { headers: { cookie: head.get("cookie") ?? "" } })
  );
  const isAdmin = access.status === "ok";

  // Recorded here rather than in the browser because this is the number that
  // matters most: a search that finds nothing is a runner who leaves without
  // buying, and often a photo tagged wrong. An ad blocker must not be able to
  // hide that, and neither should a page served from cache.
  if (bib && bib.trim()) {
    const h = head;
    const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip")?.trim() || "unknown";
    await record({
      k: "search",
      q: bib.trim().slice(0, 12),
      n: view.kind === "search" ? view.photos.length : 0,
      // Kept apart from n so a search that offered only vague suggestions can
      // be told from one that turned up nothing whatsoever.
      m: view.kind === "search" ? view.maybes.length : 0,
      r: referrerName(h.get("referer"), (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0]),
      v: await visitorHash(ip, h.get("user-agent") ?? ""),
    });
  }

  return (
    <GalleryClient
      view={view}
      initialBib={bib ?? ""}
      openPhotoId={photo ?? ""}
      isAdmin={isAdmin}
    />
  );
}
