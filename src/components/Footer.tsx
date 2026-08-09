import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-3">
          <Image
            src="/images/logo-ink.png"
            alt="h_kivimurd Photography"
            width={360}
            height={184}
            className="h-24 w-auto sm:h-28"
          />
          <p className="max-w-xs text-sm text-muted">
            Race-day photography from Ironman Tallinn and other Estonian events.
            Find your bib, find your moment.
          </p>
        </div>

        {/* Flex (not an equal-width grid) from sm up, so the Contact column can
            size to the email address instead of wrapping it mid-word. */}
        <div className="grid grid-cols-2 gap-8 font-mono text-sm sm:flex sm:gap-12">
          <div className="flex flex-col gap-2">
            <span className="uppercase tracking-wide text-muted">Shop</span>
            <Link href="/gallery" className="transition-colors hover:text-blue">
              All photos
            </Link>
            <Link href="/#find" className="transition-colors hover:text-blue">
              Find my bib
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="uppercase tracking-wide text-muted">Contact</span>
            <Link href="/about" className="transition-colors hover:text-blue">
              About
            </Link>
            <a
              href="mailto:helen.kivimurd@gmail.com"
              className="break-all transition-colors hover:text-blue sm:whitespace-nowrap sm:break-normal"
            >
              helen.kivimurd@gmail.com
            </a>
          </div>
          <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
            <span className="uppercase tracking-wide text-muted">Socials</span>
            <a
              href="https://instagram.com/h_kivimurd"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 transition-colors hover:text-blue"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
              </svg>
              @h_kivimurd
            </a>
            <a
              href="https://www.facebook.com/helenliiskivimurd/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 transition-colors hover:text-blue"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                <path
                  d="M14 9h2.5V6h-2.5c-2 0-3.5 1.5-3.5 3.5V11H8v3h2.5v6h3v-6h2.3l.7-3h-3v-1.3c0-.6.4-1.7 1.5-1.7Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              Helen Liis Kivimurd
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-card px-5 py-4 text-center font-mono text-xs text-muted sm:px-8">
        © {new Date().getFullYear()} h_kivimurd Photography. All race photos are copyrighted —
        unauthorised use or screenshotting is prohibited.
      </div>
    </footer>
  );
}
