import GalleryClient from "./GalleryClient";
import { getPhotos } from "@/lib/catalog";
import { browse } from "@/lib/browse";

// The catalogue is read per request, so a photo uploaded through /admin is
// in the gallery immediately instead of waiting for the next build.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "All photos — h_kivimurd Photography",
};

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ bib?: string; event?: string; discipline?: string }>;
}) {
  const { bib, event, discipline } = await searchParams;
  const photos = await getPhotos();

  // Which of the three levels this is — events, disciplines, or photos — is
  // decided here so that only what the level needs crosses to the browser.
  // Opening one discipline sends that discipline, not the whole catalogue.
  const view = browse(photos, { event, discipline, bib });

  return <GalleryClient view={view} initialBib={bib ?? ""} />;
}
