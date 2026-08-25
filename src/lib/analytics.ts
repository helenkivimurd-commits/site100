import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ANALYTICS_DIR } from "./storage";

// Counting visitors without tracking people.
//
// Nothing here identifies anyone. No cookie is set, no address is stored, and
// the only thing standing in for a person is a short hash of their address and
// browser mixed with a secret that changes every night. The next day the same
// visitor hashes to something else and yesterday's hashes cannot be tied to
// anyone — the salt that made them is gone.
//
// That is deliberate: under GDPR, analytics that identify people need consent,
// which means a banner in front of the shop before anyone can search for a
// photo. Counting this way needs no banner because there is nothing to consent
// to.
//
// One line of JSON per event, appended, one file per month. Reads take the
// whole month at once, which at this shop's traffic is a few hundred kilobytes.

export type EventKind = "view" | "search" | "order";

export type VisitEvent = {
  /** Unix milliseconds. */
  t: number;
  k: EventKind;
  /** Page path, without the query — never the full URL, which can carry a bib. */
  p?: string;
  /** Which site sent them: "instagram", "facebook", "google", "direct". */
  r?: string;
  /** The number searched for. Not personal: it is printed on their chest. */
  q?: string;
  /** How many photos that search found. Zero is the interesting case. */
  n?: number;
  /** Order total in cents, and how many photos. */
  c?: number;
  /** Stands in for a person, for one day only. */
  v?: string;
};

const monthFile = (d: Date) =>
  path.join(ANALYTICS_DIR, `visits-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}.jsonl`);

// A random value made once and kept on disk. Without it the daily salt would
// reset on every restart and one visitor would be counted several times.
let saltCache: string | null = null;
async function siteSalt(): Promise<string> {
  if (saltCache) return saltCache;
  const file = path.join(ANALYTICS_DIR, "salt");
  try {
    saltCache = (await fs.readFile(file, "utf-8")).trim();
    if (saltCache) return saltCache;
  } catch {
    // not made yet
  }
  const made = crypto.randomBytes(32).toString("hex");
  await fs.mkdir(ANALYTICS_DIR, { recursive: true });
  // wx: if another request won the race, use theirs rather than overwriting and
  // splitting today's visitors across two salts.
  try {
    await fs.writeFile(file, made, { flag: "wx", mode: 0o600 });
    saltCache = made;
  } catch {
    saltCache = (await fs.readFile(file, "utf-8")).trim();
  }
  return saltCache;
}

/** Who this is, as far as today is concerned. Tomorrow it is someone else. */
export async function visitorHash(ip: string, userAgent: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const salt = await siteSalt();
  return crypto.createHash("sha256").update(`${salt}:${day}:${ip}:${userAgent}`).digest("hex").slice(0, 12);
}

/** Reduce a referrer to the site that sent them, or nothing. */
export function referrerName(referrer: string | null, ownHost: string): string {
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "direct";
  }
  if (!host || host === ownHost.replace(/^www\./, "").toLowerCase()) return "direct";
  if (host.includes("instagram")) return "instagram";
  if (host.includes("facebook") || host === "l.facebook.com" || host.includes("fb.")) return "facebook";
  if (host.includes("google")) return "google";
  if (host.includes("t.co") || host.includes("twitter") || host.includes("x.com")) return "twitter";
  return host;
}

/**
 * Append one event. Never throws: a shop that cannot count its visitors should
 * still sell photographs, so every failure here is swallowed on purpose.
 */
export async function record(event: Omit<VisitEvent, "t">): Promise<void> {
  try {
    await fs.mkdir(ANALYTICS_DIR, { recursive: true });
    const line = JSON.stringify({ t: Date.now(), ...event }) + "\n";
    // O_APPEND: concurrent requests interleave whole lines rather than
    // overwriting each other, so no locking is needed for writes this small.
    await fs.appendFile(monthFile(new Date()), line, "utf-8");
  } catch {
    // counting is not worth an error page
  }
}

/** Every event from the last `days` days, oldest first. */
export async function readEvents(days: number): Promise<VisitEvent[]> {
  const since = Date.now() - days * 86_400_000;
  const months = new Set<string>();
  for (let d = new Date(since); d.getTime() <= Date.now() + 86_400_000; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.add(monthFile(d));
  }
  months.add(monthFile(new Date()));

  const out: VisitEvent[] = [];
  for (const file of months) {
    let text: string;
    try {
      text = await fs.readFile(file, "utf-8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line) as VisitEvent;
        // A half-written final line from a crash should cost that line, not
        // the whole month's figures.
        if (typeof e?.t === "number" && e.t >= since) out.push(e);
      } catch {
        // ignore
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
