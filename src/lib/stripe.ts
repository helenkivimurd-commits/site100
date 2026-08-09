import Stripe from "stripe";

// No apiVersion pin — the SDK then uses whatever version your Stripe account
// is set to, so upgrading the package can't silently change API behaviour.
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Copy .env.local.example to .env.local and add your key."
    );
  }

  client = new Stripe(key);
  return client;
}
