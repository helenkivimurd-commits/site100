// A fixed-window rate limiter held in memory.
//
// Deliberately not a shared store: this app already requires a single Node
// process (the write queues guarding photos.json and orders.json are
// per-process too), so an in-memory Map is consistent with that constraint.
// If this ever runs as more than one process, the counters split across them
// and the effective limit multiplies — move this to Redis at the same time as
// the JSON files move to a database.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Sweep expired entries once the map is big enough to be worth it, so a flood
// of one-off IPs can't grow it without bound.
const SWEEP_THRESHOLD = 5_000;

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the caller may retry. Only meaningful when ok is false. */
  retryAfter: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > SWEEP_THRESHOLD) sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count++;

  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  return { ok: true, retryAfter: 0 };
}

// Lets a successful login clear the failure count, so one fat-fingered password
// doesn't count against the photographer for the rest of the window.
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

// The client address, as seen through the reverse proxy.
//
// `x-forwarded-for` is trivially forged by whoever sends the request, so this
// is only trustworthy when a proxy in front overwrites it — which Caddy's
// `reverse_proxy` does. The Node port must therefore never be exposed to the
// internet directly; see DEPLOYMENT.md. When no proxy is present (local dev)
// every caller shares the "unknown" bucket, which is fine for one developer.
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip")?.trim() || "unknown";
  return `${scope}:${ip}`;
}
