"use client";

import { useCallback, useEffect, useState } from "react";
import PhotoCard from "./PhotoCard";
import PhotoLightbox from "./PhotoLightbox";
import type { Photo } from "@/lib/types";

// Opening a photo puts it in the address bar, so a single photograph can be
// linked to — sent to the runner in it, posted, or kept. Without that the only
// shareable thing was "search this number and scroll", and a photo with no
// readable bib could not be pointed at all.
//
// The URL is changed through the history API rather than the router, because a
// router navigation would re-run the page on the server: a fresh catalogue
// read, and a second search recorded in the visit log for a photo that was
// merely opened.
export default function PhotoGrid({
  photos,
  openPhotoId = "",
  isAdmin = false,
}: {
  photos: Photo[];
  openPhotoId?: string;
  isAdmin?: boolean;
}) {
  // Read from the server's own parse of the query, so the first render already
  // agrees with the address bar and there is nothing to correct afterwards.
  const [activeIndex, setActiveIndex] = useState<number | null>(() => {
    if (!openPhotoId) return null;
    const i = photos.findIndex((p) => p.id === openPhotoId);
    return i === -1 ? null : i;
  });
  const active = activeIndex !== null ? photos[activeIndex] : null;

  const urlFor = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("photo", id);
    else url.searchParams.delete("photo");
    return url.toString();
  }, []);

  // Opening adds a history entry, so Back closes the photo — which is what the
  // gesture means on a phone. Stepping to the next photo replaces it instead,
  // or a browse through twenty photos would bury the page behind twenty
  // presses of Back.
  const open = useCallback(
    (i: number) => {
      setActiveIndex(i);
      window.history.pushState({ photo: photos[i].id }, "", urlFor(photos[i].id));
    },
    [photos, urlFor]
  );

  const step = useCallback(
    (i: number) => {
      setActiveIndex(i);
      window.history.replaceState({ photo: photos[i].id }, "", urlFor(photos[i].id));
    },
    [photos, urlFor]
  );

  const close = useCallback(() => {
    setActiveIndex(null);
    // Unwind the entry that opened it, so closing leaves the history as it was
    // rather than stacking a dead step to press Back through.
    if (window.history.state?.photo) window.history.back();
    else window.history.replaceState(null, "", urlFor(null));
  }, [urlFor]);

  // Back, or a swipe back, closes the photo instead of leaving the page.
  useEffect(() => {
    const onPop = () => setActiveIndex(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => (
          <PhotoCard key={photo.id} photo={photo} onOpen={() => open(i)} />
        ))}
      </div>

      {active && (
        <PhotoLightbox
          photo={active}
          isAdmin={isAdmin}
          onClose={close}
          onPrev={activeIndex! > 0 ? () => step(activeIndex! - 1) : undefined}
          onNext={activeIndex! < photos.length - 1 ? () => step(activeIndex! + 1) : undefined}
        />
      )}
    </>
  );
}
