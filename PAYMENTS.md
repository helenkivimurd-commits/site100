# Payments setup

The site takes payments through **Stripe Checkout** (Stripe's own hosted payment
page) and delivers photos as download links — shown on screen straight after
payment, and emailed as a backup.

Everything below is in **test mode** until you swap in live keys. No real money
moves and you can use fake card numbers.

---

## 1. Install the Stripe package

```bash
cd /Users/kristjan/Downloads/site
npm install stripe
```

(Email uses Stripe's competitor Resend over plain HTTP, so there's no second
package to install.)

## 2. Create your keys file

```bash
cp .env.local.example .env.local
```

Open `.env.local` in a text editor. It has comments explaining every line.

**This file holds your secret keys. Never share it, never email it, never commit
it to git.** It is already listed in `.gitignore`.

Set `ADMIN_PASSWORD` while you're in there. It locks `/admin` and the photo APIs
behind it — including the one that hands out unwatermarked originals. Until it
has a real value those pages refuse every request, so nothing is exposed by
forgetting, but you also can't upload photos.

## 3. Get a Stripe account and key

1. Sign up at <https://dashboard.stripe.com/register>. Estonia is fully supported.
2. You start in **Test mode** automatically — no business verification needed yet.
3. Go to **Developers → API keys** and copy the **Secret key** (starts with `sk_test_`).
4. Paste it into `.env.local` as `STRIPE_SECRET_KEY`.

To take **real** money later you complete "Activate account": business details,
Estonian registry code if you have one, and an IBAN for payouts. Stripe's fee is
roughly **1.5% + €0.25** per European card payment.

## 4. Get the webhook working locally

The webhook is how the site learns that a payment actually succeeded. Stripe
can't reach `localhost` from the internet, so you forward it with Stripe's CLI.

```bash
# Install once (needs Homebrew — see the README for installing Homebrew)
brew install stripe/stripe-cli/stripe

stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Leave that running in its own terminal window. It prints a line like:

```
Ready! Your webhook signing secret is whsec_1a2b3c...
```

Copy that `whsec_...` value into `.env.local` as `STRIPE_WEBHOOK_SECRET`, then
restart `npm run dev`.

## 5. (Optional) Turn on emails

Without this, purchases still work — the customer just doesn't get a
confirmation email, only the on-screen download links.

1. Sign up at <https://resend.com> (free tier is plenty).
2. **API Keys → Create**, copy the key into `.env.local` as `RESEND_API_KEY`.
3. Leave `EMAIL_FROM` as the `onboarding@resend.dev` default for testing. For
   real orders, verify your own domain in Resend and change it to something like
   `photos@kivimurd.ee`.

## 6. Test a purchase

With `npm run dev` running in one terminal and `stripe listen` in another:

1. Go to <http://localhost:3000>, add a few photos to the basket, click Checkout.
2. Enter any email address, click **Pay**.
3. On Stripe's page use test card **`4242 4242 4242 4242`**, any future expiry
   date, any 3-digit CVC, any postcode.
4. You should land back on a success page with a Download button per photo.

The downloaded files are currently **placeholders** — coloured images labelled
with their photo id and bib number, living in `/Users/kristjan/Downloads/Media/`.
They exist so the payment flow can be tested end to end before the real photos
are available. Replace them with the real JPGs (same filenames, e.g.
`DSC00009.JPG`) and everything keeps working.

After paying you can leave the success page — purchases are remembered in the
browser and reachable again from **My photos** in the top menu, or directly at
<http://localhost:3000/downloads>.

Other useful test cards:

| Card number | What happens |
|---|---|
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 9995` | Declined — insufficient funds |
| `4000 0025 0000 3155` | Requires 3D Secure confirmation |

---

## How it fits together

| File | Job |
|---|---|
| `src/app/checkout/page.tsx` | Basket form. Sends **photo ids only** to the server |
| `src/app/api/checkout/route.ts` | Looks up real prices, creates the Stripe session |
| `src/app/api/stripe/webhook/route.ts` | Stripe confirms payment here. Sends the email |
| `src/app/api/order/route.ts` | Success page asks this whether the order is paid |
| `src/app/api/download/route.ts` | Checks the token, serves the original file |
| `src/proxy.ts` | Password-gates `/admin` and `/api/photos/*`. Leaves `/api/download` alone |
| `src/lib/adminAuth.ts` | The password check itself |
| `src/app/checkout/success/page.tsx` | Thank-you page with download buttons |
| `src/lib/orders.ts` | Order records and download tokens |
| `src/lib/email.ts` | The confirmation email |
| `.data/orders.json` | Where orders are stored (created automatically) |

**Two rules this design follows, and why:**

1. **The browser never sends prices.** The basket lives in `localStorage`, which
   anyone can edit. `/api/checkout` receives ids, then recalculates every price
   from `src/lib/pricing.ts` on the server.

2. **Photos are delivered from the webhook, not the success page.** A customer
   can close the tab the moment they pay, so the redirect back may never happen.
   The webhook always arrives.

Prices themselves are still edited in one place: **`src/lib/pricing.ts`**.

---

## Before you go live

- [ ] Complete Stripe account activation (business details + IBAN)
- [ ] Swap `sk_test_...` for `sk_live_...` in the production environment
- [ ] Register the real webhook URL at **Developers → Webhooks**, event
      `checkout.session.completed`, and use *that* signing secret
- [ ] Set `NEXT_PUBLIC_BASE_URL` to your real `https://` domain
- [ ] Verify your sending domain in Resend
- [ ] Set a real `ADMIN_PASSWORD` in the production environment, not the
      placeholder from `.env.local.example`. The login travels in plain text, so
      the site must be on `https://` before you type it anywhere but localhost
- [ ] Move orders out of a JSON file if deploying somewhere serverless like
      Vercel, where the filesystem is read-only
- [ ] Make sure the `Media/` folder is present on the server — downloads read
      the originals from there
- [ ] Decide on VAT. Stripe Tax can handle it, but it is not switched on here
- [ ] Write your refund / terms text — Stripe asks for a policy URL
