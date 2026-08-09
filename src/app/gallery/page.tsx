import GalleryClient from "./GalleryClient";
import { photos } from "@/lib/catalog";

export const metadata = {
  title: "All photos — h_kivimurd Photography",
};

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ bib?: string }>;
}) {
  const { bib } = await searchParams;
  return <GalleryClient photos={photos} initialBib={bib ?? ""} />;
}
