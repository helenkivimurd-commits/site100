# Race photography shop

A Next.js shop for selling race photographs. Athletes find themselves by bib
number, buy a photo, and get a download link; the photographer uploads and
manages the catalogue from a password-protected admin page.

Stack: Next.js 16 (App Router, Turbopack), React 19, Tailwind 4, sharp for image
processing, Stripe for payments.

## Setting up on a new machine

```bash
git clone https://github.com/YOUR_USERNAME/site.git
cd site
npm install
```

Then two things that are **deliberately not in git** — the clone will not run
without them:

**1. Secrets.** Copy the template and fill it in. Every variable is documented
in the file itself.

```bash
cp .env.local.example .env.local
```

At minimum you need `ADMIN_PASSWORD` and `STRIPE_SECRET_KEY`. See
[PAYMENTS.md](PAYMENTS.md) for getting Stripe keys and testing a purchase.

**2. The original photos.** Originals live in a `Media/` folder **next to** the
project directory, not inside it — that is what keeps them from ever being
served as static files:

```
parent/
├── site/     ← this repository
└── Media/    ← original JPEGs, plus Media/uploads/ for admin uploads
```

Without `../Media` the site still builds and the gallery still works (previews
and thumbnails are committed under `public/photos/`), but the admin original
viewer and paid downloads return 404.

Then:

```bash
npm run dev
```

Open <http://localhost:3000>. The admin page is at `/admin` — leave the username
blank and enter your `ADMIN_PASSWORD`.

## Commands

```bash
npm run dev     # dev server (Turbopack)
npm run build   # production build
npm start       # serve the production build
npm run lint    # eslint
```

## Documentation

| File | What's in it |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the app works, and what every file is for |
| [PAYMENTS.md](PAYMENTS.md) | Stripe setup, testing a purchase, go-live checklist |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deploying to a VPS with HTTPS, backups, updates |
| [AGENTS.md](AGENTS.md) | Notes for AI coding agents working in this repo |

## Things worth knowing before you change anything

- **Serverless hosts will not work.** The app writes to disk for uploads and
  order records. Vercel and Netlify have read-only runtime filesystems. See
  [DEPLOYMENT.md](DEPLOYMENT.md).
- **Orders live in `.data/orders.json`**, which is gitignored. It is real
  customer data — back it up, and don't commit it.
- **`.env.local` must never be committed.** It is gitignored, and the admin
  password plus Stripe secret key live there.
