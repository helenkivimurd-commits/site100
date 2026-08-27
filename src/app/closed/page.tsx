import Link from "next/link";

export const metadata = {
  title: "h_kivimurd Photography",
};

// What anyone arriving at the shop sees while it is closed. It says the one
// thing a visitor actually needs — whether their own photos are still theirs —
// rather than a bare "come back later".
export default function ClosedPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-5 py-24 text-center sm:py-32">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">
        h_kivimurd Photography
      </p>
      <h1 className="mt-4 font-display text-4xl uppercase tracking-wide sm:text-5xl">
        The shop is closed
      </h1>
      <p className="mt-5 text-sm text-muted">
        Race photos from Ironman Tallinn, Ironman 70.3 Tallinn and the Sunset run are not on
        sale at the moment.
      </p>
      <p className="mt-4 text-sm text-muted">
        <span className="text-ink">If you have already bought photos, they are still yours.</span>{" "}
        The download links from your confirmation email keep working until they expire.
      </p>
      <Link
        href="/downloads"
        className="mt-8 rounded-full bg-blue px-6 py-3 font-mono text-sm uppercase tracking-wide text-white transition-colors hover:bg-blue-hover"
      >
        My downloads
      </Link>
      <p className="mt-8 font-mono text-xs text-muted">helen.kivimurd@gmail.com</p>
    </div>
  );
}
