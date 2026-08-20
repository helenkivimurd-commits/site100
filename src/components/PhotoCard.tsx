"use client";

import Image from "next/image";
import { useCart, toCartItem } from "./CartProvider";
import { formatMoney } from "@/lib/money";
import { photoLabel } from "@/lib/photoTitle";
import type { Photo } from "@/lib/types";

export default function PhotoCard({
  photo,
  onOpen,
}: {
  photo: Photo;
  onOpen: () => void;
}) {
  const { has, add, remove } = useCart();
  const inCart = has(photo.id);
  const aspect = photo.thumbWidth / photo.thumbHeight;

  return (
    <div className="group relative flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full overflow-hidden rounded-md bg-card"
        style={{ aspectRatio: aspect }}
        aria-label={`View photo ${photo.id.toUpperCase()}`}
      >
        <Image
          src={`/api/photo/thumb/${photo.id}`}
          alt={photoLabel(photo)}
          fill
          sizes="(min-width: 1024px) 23vw, (min-width: 640px) 45vw, 90vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/35 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <span className="absolute right-2.5 top-2.5 rounded-full bg-ink/70 px-2 py-1 font-mono text-[10px] text-white backdrop-blur-sm">
          {formatMoney(photo.price)}
        </span>

        {photo.bibs.length > 0 && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-page/90 px-2.5 py-1 font-mono text-[11px] text-ink">
            #{photo.bibs.join(" #")}
          </span>
        )}
      </button>

      <div className="mt-2 flex items-center justify-end">
        <button
          type="button"
          onClick={() => (inCart ? remove(photo.id) : add(toCartItem(photo)))}
          className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
            inCart
              ? "border-ink bg-ink text-white"
              : "border-blue text-blue hover:bg-blue hover:text-white"
          }`}
        >
          {inCart ? "Added" : "Add"}
        </button>
      </div>
    </div>
  );
}
