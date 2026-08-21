import GalleryClient from "./GalleryClient";
import { getPhotos } from "@/lib/catalog";

// The catalogue is read per request, so a photo uploaded through /admin is
// in the gallery immediately instead of waiting for the next build.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "All photos — h_kivimurd Photography",
};

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ bib?: string }>;
}) {
  const { bib } = await searchParams;
  const photos = await getPhotos();
  return <GalleryClient photos={photos} initialBib={bib ?? ""} />;
}
