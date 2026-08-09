"use client";

import { useState } from "react";
import PhotoCard from "./PhotoCard";
import PhotoLightbox from "./PhotoLightbox";
import type { Photo } from "@/lib/types";

export default function PhotoGrid({ photos }: { photos: Photo[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex !== null ? photos[activeIndex] : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => (
          <PhotoCard key={photo.id} photo={photo} onOpen={() => setActiveIndex(i)} />
        ))}
      </div>

      {active && (
        <PhotoLightbox
          photo={active}
          onClose={() => setActiveIndex(null)}
          onPrev={
            activeIndex! > 0 ? () => setActiveIndex((i) => (i ?? 0) - 1) : undefined
          }
          onNext={
            activeIndex! < photos.length - 1
              ? () => setActiveIndex((i) => (i ?? 0) + 1)
              : undefined
          }
        />
      )}
    </>
  );
}
