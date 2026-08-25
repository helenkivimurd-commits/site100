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

// The salt is thrown away and replaced every day, and only ever one exists.
//
// This is the part that makes yesterday's numbers safe to keep. Mixing the date
// into a permanent salt is not enough: anyone holding that permanent value could
// take a stored hash and try all four billion addresses against it until one
// matched, on any past day. Once the salt that made a hash no longer exists
// anywhere, that hash cannot be turned back into a person by anyone, including
// us — so the visit log is genuinely anonymous rather than merely obscured.
//
// The cost is that the day boundary is when counting resets, which is what a
// daily visitor count means anyway.
let cached: { day: string; salt: string } | null = null;

async function saltForToday(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  if (cached?.day === today) return cached.salt;

  const file = path.join(ANALYTICS_DIR, "salt");
  await fs.mkdir(ANALYTICS_DIR, { recursive: true });

  try {
    const [day, salt] = (await fs.readFile(file, "utf-8")).trim().split(":");
    if (day === today && salt) {
      cached = { day, salt };
      return salt;
    }
  } catch {
    // not made yet
  }

  // A new day: overwrite, so the value that made yesterday's hashes is gone.
  const salt = crypto.randomBytes(32).toString("hex");
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${today}:${salt}`, { mode: 0o600 });
  await fs.rename(tmp, file);
  cached = { day: today, salt };
  return salt;
}

/** Who this is, as far as today is concerned. Tomorrow it is nobody. */
export async function visitorHash(ip: string, userAgent: string): Promise<string> {
  const salt = await saltForToday();
  return crypto.createHash("sha256").update(`${salt}:${ip}:${userAgent}`).digest("hex").slice(0, 12);
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
