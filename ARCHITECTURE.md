# How this project works

A race-photography shop. Athletes search their **bib number**, find photos of
themselves, and buy digital downloads. Built with Next.js 16 (App Router),
React 19, Tailwind v4 and TypeScript. Photos are processed with `sharp`,
payments run through Stripe.

There is no database. Photo metadata is a JSON file; orders are a JSON file.

---

## The three journeys

Everything in this project serves one of three paths.

### 1. An athlete buys a photo

```
Homepage                 types bib number into the bib-card form
   │                     src/components/BibSearch.tsx
   ▼
/gallery?bib=2037        filters the catalogue, shows matching photos
   │                     src/app/gallery/GalleryClient.tsx
   ▼
Clicks a photo           lightbox: bigger preview, price, "Add to basket"
   │                     src/components/PhotoLightbox.tsx
   ▼
Basket                   stored in the browser's localStorage
   │                     src/components/CartProvider.tsx
   ▼
/checkout                enters email, clicks Pay
   │                     src/app/checkout/page.tsx
   ▼
POST /api/checkout       ** server re-prices the order from photo ids **
   │                     src/app/api/checkout/route.ts
   ▼
Stripe's hosted page     customer enters card details on stripe.com
   │
   ├──────────────▶ POST /api/stripe/webhook    "payment succeeded"
   │                src/app/api/stripe/webhook/route.ts → sends email
   ▼
/checkout/success        download buttons, one per photo
   │                     src/app/checkout/success/SuccessClient.tsx
   ▼
GET /api/download        checks token, then redirects to a short-lived
                         signed link straight to the bucket
                         src/app/api/download/route.ts
```

Later, the same buyer can return via **My photos** (`/downloads`) — the purchase
is remembered in their browser.

### 2. The photographer publishes photos

```
Starts with a folder of JPGs
   │
   ├── Bulk route: node scripts/process-photos.mjs
   │       resizes + watermarks everything in one go
   │
   └── Normal route: /admin  →  drag photos onto the page
           POST /api/photos
           resizes, watermarks, writes preview + thumb,
           uploads the original to the B2 bucket
   ▼
Tags each photo in /admin        clicks a thumbnail, reads the bib number
   │                             off the full-size original, types it in
   │                             src/app/admin/PhotoInspector.tsx
   ▼
PATCH /api/photos                saves to src/data/photos.json
   ▼
Photo is now findable by bib
```

The whole admin area sits behind a password (`src/proxy.ts`).

### 3. Money and files

| Question | Answer |
|---|---|
| Who decides the price? | The **server**, in `src/app/api/checkout/route.ts`, reading `src/lib/pricing.ts` |
| Who confirms payment? | Stripe, via the webhook — never the browser |
| Where are unwatermarked originals? | A **private** Backblaze B2 bucket, under `originals/`. Never on this server, never served as static files |
| Who can download them? | Someone with a token from a paid order, or the logged-in admin |
| How does the file actually reach them? | `/api/download` checks access, then redirects to a signed bucket link that expires after 15 minutes. The bytes never pass through this server |
| What happens to the original when a photo is deleted in `/admin`? | **Nothing — it stays in the bucket, on purpose.** Deleting only removes the catalogue entry, preview and thumbnail. The original is the irreplaceable thing, so it is never removed by an admin click; clear them by hand in the B2 dashboard if you ever need the space |

---

## Every file, and what it does

### Configuration and docs

| File | Purpose |
|---|---|
| `package.json` | Dependencies and the `dev` / `build` / `start` / `lint` scripts |
| `next.config.ts` | Next.js settings. Only sets allowed image quality levels |
| `tsconfig.json` | TypeScript config. Defines the `@/…` import alias → `src/` |
| `postcss.config.mjs` | Loads Tailwind v4 |
| `eslint.config.mjs` | Lint rules |
| `.env.local` | **Your secrets.** Stripe key, admin password. Gitignored, never commit |
| `.env.local.example` | Template for the above, with comments explaining each value |
| `.gitignore` | Keeps secrets, `node_modules`, and order data out of version control |
| `README.md` | Still the unmodified `create-next-app` boilerplate |
| `PAYMENTS.md` | Stripe setup guide |
| `ARCHITECTURE.md` | This file |
| `AGENTS.md` / `CLAUDE.md` | Instructions for AI coding assistants |
| `eng.traineddata` | **Dead weight.** 5 MB Tesseract OCR model from an abandoned experiment. Nothing uses it |

### App shell — wraps every page

| File | Purpose |
|---|---|
| `src/app/layout.tsx` | The HTML shell. Loads the four fonts, wraps everything in `CartProvider`, adds `Header` and `Footer` |
| `src/app/globals.css` | Colour palette and font variables. Change the site's colours here |
| `src/proxy.ts` | Runs **before** every request to `/admin` and `/api/photos/*`. Rejects anyone without the password |
| `src/app/favicon.ico` | Browser tab icon |

### Pages the public sees

| File | Route | Purpose |
|---|---|---|
| `src/app/page.tsx` | `/` | Homepage: hero photo, bib search, 8 sample photos, how-it-works, pricing table |
| `src/app/gallery/page.tsx` | `/gallery` | Reads `?bib=` from the URL, hands the catalogue to the client component |
| `src/app/gallery/GalleryClient.tsx` | | The filtering UI: bib box, day chips, discipline chips, results grid |
| `src/app/about/page.tsx` | `/about` | Photographer bio and contact |
| `src/app/checkout/page.tsx` | `/checkout` | Email field, order summary, the Pay button |
| `src/app/checkout/success/page.tsx` | `/checkout/success` | Reads `?session_id=` from Stripe's redirect |
| `src/app/checkout/success/SuccessClient.tsx` | | Confirms payment, shows download buttons, empties the basket |
| `src/app/downloads/page.tsx` | `/downloads` | "My photos" — past purchases remembered in this browser |

### Shared UI components

| File | Purpose |
|---|---|
| `src/components/Header.tsx` | Sticky top bar: logo, nav, basket button with count, mobile menu |
| `src/components/Footer.tsx` | Logo, links, contact email |
| `src/components/BibSearch.tsx` | The bib-number form. Two looks: the big race-bib card on the homepage, and a compact version |
| `src/components/PhotoGrid.tsx` | Responsive grid of photo cards, and opens the lightbox |
| `src/components/PhotoCard.tsx` | One photo tile: thumbnail, price badge, bib badge, Add button |
| `src/components/PhotoLightbox.tsx` | Full-screen photo view with details and Add to basket. Arrow keys navigate |
| `src/components/CartProvider.tsx` | The basket. Holds items, computes totals and bundle discounts, saves to `localStorage` |
| `src/components/CartDrawer.tsx` | The slide-out basket panel |

### Admin — photographer only, password protected

| File | Purpose |
|---|---|
| `src/app/admin/page.tsx` | Upload box, and the list of every photo with editable day / discipline / bib fields |
| `src/app/admin/PhotoInspector.tsx` | Full-screen viewer for reading bib numbers off the original. `Enter` saves and jumps to the next photo, `←/→` navigate, `Esc` closes |

### API routes — the server

| File | Route | Purpose |
|---|---|---|
| `src/app/api/photos/route.ts` | `/api/photos` | Admin only. `GET` lists photos, `POST` uploads, `PATCH` edits, `DELETE` removes |
| `src/app/api/photos/original/route.ts` | `/api/photos/original` | Admin only. Serves a big unwatermarked copy so bibs are readable |
| `src/app/api/checkout/route.ts` | `/api/checkout` | Takes photo **ids**, re-prices server-side, creates the Stripe session |
| `src/app/api/stripe/webhook/route.ts` | `/api/stripe/webhook` | Stripe calls this to confirm payment. Verifies the signature, sends the email |
| `src/app/api/order/route.ts` | `/api/order` | Asks Stripe whether an order is paid. Powers the success and downloads pages |
| `src/app/api/download/route.ts` | `/api/download` | Checks the token, then streams the full-resolution original |

### Logic library — no UI, just rules

| File | Purpose |
|---|---|
| `src/lib/types.ts` | The shape of a photo, the six disciplines, the cart item type |
| `src/lib/catalog.ts` | Loads `photos.json` and provides `getPhoto`, `searchByBib` |
| `src/lib/pricing.ts` | **All prices live here.** €5 each, 20% off at 5+, 40% off at 10+ |
| `src/lib/money.ts` | Formats numbers as euros |
| `src/lib/serverImage.ts` | Resizes and watermarks an uploaded photo; turns filenames into ids |
| `src/lib/originals.ts` | The only file that knows where originals live. Finds, uploads, reads, and signs download links for objects in the B2 bucket |
| `src/lib/orders.ts` | Order records and download tokens. Reads/writes `.data/orders.json` |
| `src/lib/stripe.ts` | Creates the Stripe client from `STRIPE_SECRET_KEY` |
| `src/lib/email.ts` | The confirmation email, sent through Resend |
| `src/lib/purchases.ts` | Remembers past orders in the browser so "My photos" works |
| `src/lib/adminAuth.ts` | The password check: Basic auth plus a signed session cookie |

### Data and assets

| Path | Purpose |
|---|---|
| `src/data/photos.json` | **The catalogue.** Every photo's title, event, day, discipline, size and bib numbers. Order in this file = display order |
| `.data/orders.json` | Orders and download tokens. Created automatically, gitignored |
| `public/photos/thumb/` | 900px watermarked — grid tiles |
| `public/photos/preview/` | 1600px watermarked — the lightbox |
| `public/photos/hero/` | 2560px **unwatermarked** — homepage banner only |
| `public/images/` | Logo (ink and white) and the photographer portrait |
| B2 bucket, `originals/` | **Off this server entirely.** The untouched originals, keyed `<photo-id>.<ext>`. Reachable only through `src/lib/originals.ts` |

### Scripts — run by hand, not part of the site

| File | Purpose |
|---|---|
| `scripts/process-photos.mjs` | Bulk-converts originals into thumb/preview/hero. Filenames are hardcoded in the file |
| `scripts/process-logo.mjs` | Turns the logo photo into transparent PNGs |
| `scripts/photo-dimensions.json` | Output of the last bulk run |

---

## Where data lives

| Data | Where | Survives a restart? |
|---|---|---|
| Photo catalogue | `src/data/photos.json` | Yes |
| Orders and tokens | `.data/orders.json` | Yes |
| The basket | Browser `localStorage`, key `hkp-basket` | Yes, per browser |
| Past purchases | Browser `localStorage`, key `hkp-purchases` | Yes, per browser |
| Admin session | Signed cookie, 12 hours | Yes |
| Secrets | `.env.local` | Yes |

Two consequences worth knowing:

- **A basket does not follow a customer between devices.** Neither does "My
  photos". The confirmation email is the cross-device backup.
- **JSON files need a real disk.** On a serverless host like Vercel the
  filesystem is read-only, so uploads and orders would fail. A normal VPS is
  fine; otherwise this needs a database.

---

## Things that do not exist yet

- **Automatic bib number recognition.** Every bib is typed in by hand in
  `/admin`. The leftover `eng.traineddata` file is from an abandoned attempt
- **A real README** — still `create-next-app` boilerplate
- **Refund handling** — no `charge.refunded` webhook
- **VAT** — Stripe Tax is not switched on
- **Tests** — there are none
