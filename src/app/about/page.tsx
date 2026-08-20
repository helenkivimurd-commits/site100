import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "About — h_kivimurd Photography",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">About</p>
        <h1 className="mt-3 font-display text-4xl uppercase tracking-wide sm:text-5xl">
          I shoot the moments you were too busy racing to see.
        </h1>
      </div>

      <div className="prose-none mt-10 flex flex-col gap-5 text-[15px] leading-relaxed text-ink/90 sm:text-base">
        <p>
          I&apos;m Helen! I&apos;m a self-taught 17-year-old photographer who fell in love with
          the raw emotion of endurance racing. There&apos;s nothing else like the moment someone
          crosses a finish line after everything they gave to get there.
        </p>
        <p>
          I&apos;m out on the course for one reason: you. The months of training, the pain, the
          doubt, the finish — you earned every second of it, and you deserve a photo that does
          it justice. Not a snapshot. Proof of what you&apos;re capable of and that you can do
          it with a smile on your face.
        </p>
        <p>
          Every print helps fund a bigger dream of mine — studying abroad. When you buy a
          photo, you&apos;re not just getting your moment frozen forever; you&apos;re helping me
          chase my dream.
        </p>
        <p>Thank you for letting me be part of your day!</p>
      </div>

      <div className="relative mx-auto mt-14 aspect-[900/1600] w-full max-w-sm overflow-hidden rounded-md bg-card">
        <Image
          src="/images/helen-kivimurd.jpg"
          alt="Helen Kivimurd, the photographer behind the camera"
          fill
          sizes="(min-width: 640px) 384px, 100vw"
          className="object-cover"
        />
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
