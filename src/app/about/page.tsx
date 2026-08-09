import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "About — h_kivimurd Photography",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="flex flex-col gap-10 sm:flex-row sm:items-start">
        <div className="relative aspect-[900/1371] w-full shrink-0 overflow-hidden rounded-md bg-card sm:w-64">
          <Image
            src="/images/photographer.jpg"
            alt="h_kivimurd, the photographer behind the camera"
            fill
            sizes="(min-width: 640px) 256px, 100vw"
            className="object-cover"
            priority
          />
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">About</p>
          <h1 className="mt-3 font-display text-4xl uppercase tracking-wide sm:text-5xl">
            One photographer, the whole race course.
          </h1>
          <p className="mt-6 font-accent text-2xl italic text-muted sm:text-3xl">
            I shoot the moments you were too busy racing to see.
          </p>
        </div>
      </div>

      <div className="prose-none mt-10 flex flex-col gap-5 text-[15px] leading-relaxed text-ink/90 sm:text-base">
        <p>
          h_kivimurd Photography covers endurance racing in Estonia — swim starts, transition
          chaos, the long grind of the bike leg, and the finish arch where it all pays off.
          Ironman Tallinn is home turf: I know where the light is good at 7am on the
          Pirita waterfront, and where the crowd gets loudest on the red carpet.
        </p>
        <p>
          Every race is shot in full — thousands of frames across the day — then sorted by bib
          number so you can find every photo of yourself in one search. No packages, no
          waiting for a gallery email: browse, preview at full size, and buy the shots that
          actually get you.
        </p>
        <p>
          Photos go up in batches during and after the event. If your number doesn&apos;t turn
          up straight away, it&apos;s still being sorted — check back in a few hours.
        </p>
      </div>

      <div className="mt-14 flex flex-col items-start gap-4 rounded-md bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl uppercase tracking-wide">Get in touch</h2>
          <p className="mt-1 text-sm text-muted">
            Race organisers, clubs, or press — reach out for coverage and licensing.
          </p>
        </div>
        <a
          href="mailto:helen.kivimurd@gmail.com"
          className="shrink-0 rounded-full bg-blue px-6 py-3 font-mono text-sm uppercase tracking-wide text-white transition-colors hover:bg-blue-hover"
        >
          helen.kivimurd@gmail.com
        </a>
      </div>

      <Link
        href="/gallery"
        className="mt-10 inline-block font-mono text-sm uppercase tracking-wide text-blue hover:text-blue-hover"
      >
        ← Browse all photos
      </Link>
    </div>
  );
}
