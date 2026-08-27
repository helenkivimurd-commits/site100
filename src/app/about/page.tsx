import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { shopOpen } from "@/lib/shopOpen";

export const metadata = {
  title: "About — h_kivimurd Photography",
};

export default function AboutPage() {
  if (!shopOpen()) redirect("/closed");

  return (
    <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">About</p>
      <h1 className="mt-4 max-w-4xl font-display text-4xl uppercase leading-[0.95] tracking-wide sm:text-6xl lg:text-7xl">
        I shoot the moments you were too busy racing to see.
      </h1>

      {/* Two columns from lg: the story reads down the left while the portrait
          holds the right. Below lg it stacks, portrait first, so a phone gets a
          face before a wall of text. */}
      <div className="mt-14 flex flex-col gap-12 lg:mt-20 lg:flex-row lg:items-start lg:gap-16">
        <div className="order-2 lg:order-1 lg:w-3/5">
          <p className="font-accent text-2xl italic leading-snug text-muted sm:text-3xl">
            I&apos;m Helen — a self-taught{" "}
            <span className="text-blue">17-year-old photographer</span> who fell in love with the
            raw emotion of endurance racing.
          </p>

          <div className="mt-8 flex flex-col gap-5 text-[15px] leading-relaxed text-ink/90 sm:text-base">
            <p>
              There&apos;s nothing else like the moment someone crosses a finish line after
              everything they gave to get there.
            </p>
            <p>
              I&apos;m out on the course for one reason: <span className="text-blue">you</span>. The
              months of training, the pain, the doubt, the finish — you earned every second of it,
              and you deserve a photo that does it justice. Not a snapshot. Proof of what
              you&apos;re capable of and that you can do it with a smile on your face.
            </p>
          </div>

          {/* Lifted out of the run of paragraphs: this is the line that explains
              why a purchase matters to her, and it was invisible mid-page. */}
          <div className="mt-10 border-l-2 border-blue bg-card/60 px-6 py-5">
            <p className="text-[15px] leading-relaxed text-ink/90 sm:text-base">
              Every print helps fund a bigger dream of mine — <strong className="font-semibold">studying abroad</strong>. When
              you buy a photo, you&apos;re not just getting your moment frozen forever;
              you&apos;re helping me chase my dream.
            </p>
          </div>

          <p className="mt-10 font-accent text-2xl italic text-ink sm:text-3xl">
            Thank you for letting me be part of your day!
          </p>

          {/* Someone who has just read the story is the likeliest person to
              follow along, so the accounts go here rather than only in the
              footer, which nobody reads after being moved by something. */}
          <div className="mt-10 border-t border-card pt-8">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">
              Follow along
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-4">
              <a
                href="https://www.instagram.com/helenkivimurd.photography"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2.5 rounded-full border border-ink/15 px-5 py-3 font-mono text-sm transition-colors hover:border-blue hover:text-blue"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                  <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
                </svg>
                @helenkivimurd.photography
              </a>
              <a
                href="https://www.facebook.com/people/helenkivimurdphotography/61593925822412/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2.5 rounded-full border border-ink/15 px-5 py-3 font-mono text-sm transition-colors hover:border-blue hover:text-blue"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                  <path
                    d="M14 9h2.5V6h-2.5c-2 0-3.5 1.5-3.5 3.5V11H8v3h2.5v6h3v-6h2.3l.7-3h-3v-1.3c0-.6.4-1.7 1.5-1.7Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                Helenkivimurd.photography
              </a>
            </div>
          </div>
        </div>

        {/* Sticky so the portrait stays with you while the story scrolls past —
            the reason to keep it beside the text rather than under it. */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-28 lg:w-2/5">
          <div className="relative aspect-[900/1600] w-full max-w-sm overflow-hidden rounded-md bg-card lg:max-w-none">
            <Image
              src="/images/helen-kivimurd.jpg"
              alt="Helen Kivimurd, the photographer behind the camera"
              fill
              sizes="(min-width: 1024px) 40vw, (min-width: 640px) 384px, 100vw"
              className="object-cover"
              priority
            />
          </div>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Helen Kivimurd
          </p>
        </div>
      </div>

      <div className="mt-20 flex flex-col items-start gap-5 rounded-md bg-ink p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div>
          <h2 className="font-display text-3xl uppercase tracking-wide text-white sm:text-4xl">
            Get in touch
          </h2>
          <p className="mt-2 max-w-md text-sm text-white/70">
            Race organisers, clubs, or press — reach out for coverage and licensing.
          </p>
        </div>
        <a
          href="mailto:helen.kivimurd@gmail.com"
          className="shrink-0 rounded-full bg-white px-6 py-3 font-mono text-sm uppercase tracking-wide text-ink transition-colors hover:bg-white/85"
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
