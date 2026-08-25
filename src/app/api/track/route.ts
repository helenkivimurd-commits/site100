import { NextResponse } from "next/server";
import { record, referrerName, visitorHash } from "@/lib/analytics";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One page view. Called by the browser once per page, because most of the site
// is served as static HTML and a static page cannot count itself.
//
// Searches and orders are NOT recorded here — those happen on the server, where
// nothing can block or fake them. This endpoint only ever adds a view, so the
// worst a bored visitor can do by calling it repeatedly is inflate a number
// that sells nothing, and the rate limit takes even that away.

const MAX_PER_MINUTE = 40;

// Pages worth counting. Anything else — the admin area, API calls, junk — is
// dropped rather than stored, so the log stays about visitors.
function tidyPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  // The query is thrown away: it can carry a bib number, and a bib is recorded
  // deliberately elsewhere or not at all.
  const p = raw.split("?")[0].split("#")[0];
  if (!p.startsWith("/")) return null;
  if (p.startsWith("/admin") || p.startsWith("/api")) return null;
  return p.length > 1 ? p.replace(/\/+$/, "") : "/";
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "track"), MAX_PER_MINUTE, 60_000);
  if (!limit.ok) return new NextResponse(null, { status: 204 });

  let body: { path?: unknown; ref?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const p = tidyPath(body.path);
  if (!p) return new NextResponse(null, { status: 204 });

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0].trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  const host = new URL(request.url).hostname;

  await record({
    k: "view",
    p,
    r: referrerName(typeof body.ref === "string" ? body.ref : null, host),
    v: await visitorHash(ip, request.headers.get("user-agent") ?? ""),
  });

  // Nothing to say back. 204 keeps it off the network tab and out of the way.
  return new NextResponse(null, { status: 204 });
}
