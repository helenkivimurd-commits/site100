import Image from "next/image";
import Link from "next/link";
import BibSearch from "@/components/BibSearch";
import PhotoGrid from "@/components/PhotoGrid";
import { photos } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import {
  SINGLE_PRICE,
  BUNDLE_5_THRESHOLD,
  BUNDLE_10_THRESHOLD,
  pricePerPhotoAt,
  bundleTotalAt,
} from "@/lib/pricing";

const previewPhotos = photos.slice(0, 8);

// Prices come from src/lib/pricing.ts — change the numbers there and this
// section (and the actual basket math) updates everywhere automatically.
const pricingTiers = [
  {
    name: "Single photo",
    price: SINGLE_PRICE,
    perPhoto: SINGLE_PRICE,
  },
  {
    name: `Bundle of ${BUNDLE_5_THRESHOLD}`,
    price: bundleTotalAt(BUNDLE_5_THRESHOLD),
    perPhoto: pricePerPhotoAt(BUNDLE_5_THRESHOLD),
  },
  {
    name: `Bundle of ${BUNDLE_10_THRESHOLD}+`,
    price: bundleTotalAt(BUNDLE_10_THRESHOLD),
    perPhoto: pricePerPhotoAt(BUNDLE_10_THRESHOLD),
  },
];

const steps = [
  {
    n: "01",
    title: "Search your bib",
    body: "Type the number that was pinned to your chest on race day. It's the only thing you need to remember.",
  },
  {
    n: "02",
    title: "Preview every shot",
    body: "See every frame we caught of you — swim exit, bike leg, run, and the finish arch — in full size before you buy.",
  },
  {
    n: "03",
    title: "Download and keep",
    body: "Buy the ones that get you, one at a time or as a bundle. High-resolution files, yours forever.",
  },
];

export default function Home() {
  return (
    <>
      {/* "Find my bib" targets the top of the hero, not the bib card lower down.
          scroll-mt clears the sticky header so the hero isn't tucked under it. */}
      <section id="find" className="relative scroll-mt-[73px] overflow-hidden bg-ink sm:scroll-mt-[81px]">
        {/* Kept under ~560px so the bib card's "Find my photos" button clears
            the fold on a typical laptop — searching a bib is the whole point of
            this page, and it was landing just below the viewport at 600px. */}
        <div className="relative h-[440px] sm:h-[480px] lg:h-[540px]">
          <Image
            src="/photos/hero/dsc00009.jpg"
            alt="A finisher pumps his fist under the Ironman Tallinn finish arch"
            fill
            priority
            className="object-cover object-[65%_30%]"
            sizes="100vw"
            quality={90}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/55 via-transparent to-transparent" />
          {/* The existing gradients all darken from the bottom, leaving the
              event name sitting on the brightest part of the frame. */}
          <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-ink/65 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-center px-5 pb-14 sm:px-8 lg:px-16">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/90 sm:tracking-[0.3em]">
              Ironman Tallinn · European Championship
            </p>
            <h1 className="mt-4 max-w-2xl font-display text-4xl uppercase leading-[0.95] tracking-wide text-white sm:text-5xl lg:text-7xl">
              You finished.
              <br />
              We caught it.
            </h1>
            <p className="mt-5 max-w-xl font-accent text-xl italic text-white/85 sm:text-2xl lg:text-3xl">
              Somewhere in a thousand frames, that&apos;s you.
            </p>
          </div>
        </div>

        <div className="relative z-10 mx-auto -mt-12 max-w-7xl px-5 sm:-mt-16 sm:px-8">
          <BibSearch variant="hero" />
        </div>

        <div className="h-10 sm:h-14" />
      </section>

      <section className="border-y border-card">
        <div className="mx-auto grid max-w-5xl grid-cols-1 divide-y divide-card font-mono text-sm text-muted sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-center justify-center gap-2 px-4 py-5">
            <span className="text-ink">1,000+</span> photos catalogued
          </div>
          <div className="flex items-center justify-center gap-2 px-4 py-5">
            <span className="text-ink">5,000</span> finishers on course
          </div>
          <div className="flex items-center justify-center gap-2 px-4 py-5">
            <span className="text-ink">3</span> disciplines covered
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-4xl uppercase tracking-wide sm:text-5xl">
            From the course
          </h2>
          <Link
            href="/gallery"
            className="font-mono text-sm uppercase tracking-wide text-blue hover:text-blue-hover"
          >
            View all photos →
          </Link>
        </div>
        <PhotoGrid photos={previewPhotos} />
      </section>

      <section className="bg-card">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="mb-12 font-display text-4xl uppercase tracking-wide sm:text-5xl">
            How it works
          </h2>
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
            {steps.map((step) => (
              <div key={step.n}>
                <span className="font-mono text-sm text-blue">{step.n}</span>
                <h3 className="mt-3 font-display text-2xl uppercase tracking-wide">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <h2 className="font-display text-4xl uppercase tracking-wide sm:text-5xl">Pricing</h2>
        <p className="mt-3 max-w-xl text-sm text-muted">
          Every photo is priced individually. Buy in bundles and the price per photo drops.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {pricingTiers.map((tier) => (
            <div key={tier.name} className="rounded-md bg-card p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{tier.name}</p>
              <p className="mt-3 font-display text-4xl tracking-wide text-blue">
                {formatMoney(tier.price)}
              </p>
              <p className="mt-2 font-mono text-sm text-muted">
                {formatMoney(tier.perPhoto)} per photo
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">
              h_kivimurd Photography
            </p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-wide sm:text-4xl">
              Shot on course, at the barriers, at the arch.
            </h2>
            <p className="mt-3 text-sm text-muted">
              I follow the race from swim start to red carpet finish so you don&apos;t have to
              rely on your own race face selfie. One photographer, one race, thousands of
              honest frames.
            </p>
          </div>
          <Link
            href="/about"
            className="shrink-0 rounded-full border border-ink px-6 py-3 font-mono text-sm uppercase tracking-wide transition-colors hover:bg-ink hover:text-white"
          >
            About the photographer
          </Link>
        </div>
      </section>
    </>
  );
}
