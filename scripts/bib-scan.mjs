import sharp from "sharp";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Reads bib numbers off newly uploaded photos and fills them into the catalogue,
// so that roughly half of them are already tagged before anyone opens /admin.
//
//   cd /srv/hkp/site && node --env-file=.env.local scripts/bib-scan.mjs
//
// Normally run by the hkp-bibscan systemd timer a few minutes apart. Safe to run
// twice at once — a lock file makes the second one exit immediately.
//
// Rules it will not break:
//   - it never touches a photo that already has a bib, and never one marked
//     reviewed. Anything typed by hand always wins.
//   - it never marks a photo reviewed. Every photo still gets looked at.
//   - it writes through the app's own PATCH endpoint rather than the catalogue
//     file, so its writes queue behind uploads in the one process that owns
//     that file. Writing the file directly from here would let a scan and an
//     upload read the same catalogue and each save a copy without the other's
//     photo in it.
//
// Two engines. Google Cloud Vision is used when a key is configured, and
// tesseract otherwise. On the same 50 Ironman bike photos, measured against
// numbers confirmed by hand:
//
//   tesseract  0% correct
//   Vision    82% correct, 2% wrong, 16% left blank
//
// Tesseract simply cannot see a helmet sticker forty pixels wide; no amount of
// contrast or thresholding recovers detail the camera never captured. It stays
// as the fallback for a machine with no key, and because it costs nothing.

const run = promisify(execFile);

const CATALOGUE_FILE = process.env.CATALOGUE_FILE ?? "src/data/photos.json";
const SEEN_FILE = process.env.OCR_SEEN_FILE ?? path.join(path.dirname(CATALOGUE_FILE), "ocr-seen.json");
const LOCK_FILE = `${SEEN_FILE}.lock`;
const APP_URL = process.env.BIB_SCAN_APP_URL ?? "http://127.0.0.1:3000";

// One photo at a time by default. The box has 2 cores and this runs while
// uploads may be in flight; finishing sooner is worth less than not making the
// upload the photographer is watching feel slow.
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 1);
const BATCH = Number(process.env.BATCH ?? 400);
const SCALE = 2000;

// Chosen from the measured trade-off, not by taste. Loosening any of the three
// raises the share of photos given a number that belongs to somebody else.
const MIN_CONFIDENCE = Number(process.env.BIB_MIN_CONFIDENCE ?? 80);
const MIN_DIGITS = Number(process.env.BIB_MIN_DIGITS ?? 3);
const MIN_PASSES = Number(process.env.BIB_MIN_PASSES ?? 2);
const MAX_BIBS_PER_PHOTO = 4;

const VISION_KEY = process.env.GOOGLE_VISION_API_KEY;

// The rule that came out of the measurement. Vision reads the rider's number
// and usually something else as well — a hoarding, another competitor, a decal
// — so what matters is choosing between them.
//
//   everything it read              94% correct, 26% wrong
//   near the middle, 3-4 digits     82% correct,  2% wrong
//
// The rider is the subject of the photograph and sits centrally; the noise is
// out at the edges. Requiring three digits loses the handful of two-digit bibs,
// but those turn into blanks rather than into somebody else's number.
const VISION_MAX_OFF_CENTRE = Number(process.env.VISION_MAX_OFF_CENTRE ?? 0.45);
const VISION_MIN_DIGITS = Number(process.env.VISION_MIN_DIGITS ?? 3);
const VISION_SEND_WIDTH = 2500;

// DRY_RUN=1 reads and reports but saves nothing, and forgets nothing — useful
// for checking what a threshold change would do before letting it loose.
const DRY_RUN = process.env.DRY_RUN === "1";

function s3Client() {
  return new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: process.env.B2_REGION,
    credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APP_KEY },
  });
}

async function prepare(source, variant) {
  // Scaled up, not down: a bib is a small part of the frame and tesseract wants
  // characters around 30px tall before it will commit to a digit.
  const base = sharp(source).rotate().resize({ width: SCALE }).greyscale();
  if (variant === "plain") return base.normalise().png().toBuffer();
  if (variant === "hard") return base.normalise().linear(1.8, -60).sharpen().png().toBuffer();
  return base.normalise().negate().linear(1.6, -40).png().toBuffer();
}

async function ocrDigits(pngPath) {
  const { stdout } = await run("tesseract", [
    pngPath, "stdout", "--psm", "11",
    "-c", "tessedit_char_whitelist=0123456789", "tsv",
  ]).catch(() => ({ stdout: "" }));

  const out = [];
  for (const line of stdout.split("\n").slice(1)) {
    const f = line.split("\t");
    if (f.length < 12) continue;
    const conf = Number(f[10]);
    const text = (f[11] ?? "").trim();
    if (!text || Number.isNaN(conf) || conf < 0) continue;
    if (!/^\d{2,4}$/.test(text)) continue;
    out.push({ text, conf });
  }
  return out;
}

// "26" where the bib is really "264" is the commonest misread — part of the
// number is behind an arm. Where both turn up, the longer one wins; a stray
// fragment left in its own right would read as a different runner entirely.
function dropPartials(found) {
  return found.filter(
    (a) => !found.some((b) => b !== a && b.text.length > a.text.length && b.text.includes(a.text))
  );
}

async function readBibs(source) {
  const tmp = path.join(os.tmpdir(), `bibscan-${process.pid}-${Math.random().toString(36).slice(2)}.png`);
  const all = new Map();
  try {
    for (const variant of ["plain", "hard", "invert"]) {
      await fs.writeFile(tmp, await prepare(source, variant));
      const seenThisPass = new Set();
      for (const { text, conf } of await ocrDigits(tmp)) {
        const prev = all.get(text);
        const votes = (prev?.votes ?? 0) + (seenThisPass.has(text) ? 0 : 1);
        seenThisPass.add(text);
        all.set(text, { conf: Math.max(prev?.conf ?? -1, conf), votes });
      }
    }
  } finally {
    await fs.rm(tmp, { force: true });
  }

  const candidates = dropPartials(
    [...all.entries()].map(([text, v]) => ({ text, conf: v.conf, votes: v.votes }))
  );

  return candidates
    .filter((c) => c.conf >= MIN_CONFIDENCE && c.text.length >= MIN_DIGITS && c.votes >= MIN_PASSES)
    .sort((a, b) => b.conf - a.conf)
    .slice(0, MAX_BIBS_PER_PHOTO)
    .map((c) => c.text);
}

async function readBibsWithVision(source) {
  const jpeg = await sharp(source)
    .rotate()
    .resize({ width: VISION_SEND_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: jpeg.toString("base64") },
          features: [{ type: "TEXT_DETECTION" }],
          imageContext: { languageHints: ["en"] },
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`vision ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const json = await res.json();
  const err = json.responses?.[0]?.error;
  if (err) throw new Error(err.message ?? "vision error");

  const width = json.responses?.[0]?.fullTextAnnotation?.pages?.[0]?.width ?? VISION_SEND_WIDTH;
  // The first annotation is the whole block of text; the rest are the pieces.
  const words = (json.responses?.[0]?.textAnnotations ?? []).slice(1);

  const found = new Map();
  for (const w of words) {
    const vertices = w.boundingPoly?.vertices ?? [];
    const xs = vertices.map((v) => v.x ?? 0);
    const ys = vertices.map((v) => v.y ?? 0);
    const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : width / 2;
    const offCentre = Math.abs(cx - width / 2) / (width / 2);

    // A number can arrive glued to something else ("845GIRO"); take the digits.
    for (const run of (w.description ?? "").split(/\D+/)) {
      if (!/^\d{2,4}$/.test(run)) continue;
      const prev = found.get(run);
      if (!prev || prev.height < height) found.set(run, { height, offCentre });
    }
  }

  const candidates = [...found.entries()]
    .map(([text, v]) => ({ text, ...v }))
    .filter((c) => c.offCentre < VISION_MAX_OFF_CENTRE && c.text.length >= VISION_MIN_DIGITS)
    .sort((a, b) => b.height - a.height);

  // One number per photo. Taking the runner-up as well doubled the wrong ones
  // for three more points of right ones — a bad trade when a wrong number sends
  // a runner to a photograph of a stranger.
  return candidates.slice(0, 1).map((c) => c.text);
}

function authHeader() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not set — cannot save results.");
  // Same shape the browser sends: empty username, password only.
  return `Basic ${Buffer.from(`:${password}`).toString("base64")}`;
}

async function saveBibs(id, bibs) {
  if (DRY_RUN) return;
  const res = await fetch(`${APP_URL}/api/photos`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    // Deliberately no `reviewed` — a scanned photo is still unreviewed, so it
    // keeps its place in the list of things to check.
    body: JSON.stringify({ id, bibs }),
  });
  if (!res.ok) throw new Error(`PATCH ${id} returned ${res.status}`);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeSeen(seen) {
  const tmp = `${SEEN_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(seen, null, 2) + "\n");
  await fs.rename(tmp, SEEN_FILE);
}

// Only one scan at a time. wx fails if the file exists, which is the lock.
async function takeLock() {
  try {
    await fs.writeFile(LOCK_FILE, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    // A lock left behind by a killed run should not block scanning forever.
    try {
      const age = Date.now() - (await fs.stat(LOCK_FILE)).mtimeMs;
      if (age > 60 * 60 * 1000) {
        await fs.rm(LOCK_FILE, { force: true });
        await fs.writeFile(LOCK_FILE, String(process.pid), { flag: "wx" });
        return true;
      }
    } catch {}
    return false;
  }
}

async function main() {
  if (!(await takeLock())) {
    console.log("another scan is already running — nothing to do");
    return;
  }

  try {
    const catalogue = await readJson(CATALOGUE_FILE, {});
    const seen = new Set(await readJson(SEEN_FILE, []));

    const todo = Object.entries(catalogue)
      .filter(([id, p]) => !seen.has(id) && !(p.bibs ?? []).length && !p.reviewed)
      .map(([id]) => id)
      .slice(0, BATCH);

    console.log(
      `${DRY_RUN ? "DRY RUN — nothing will be saved\n" : ""}` +
        `engine ${VISION_KEY ? "Google Vision" : "tesseract"}, ` +
        `catalogue ${Object.keys(catalogue).length}, already scanned ${seen.size}, to scan now ${todo.length}`
    );
    if (todo.length === 0) return;

    const s3 = s3Client();
    const bucket = process.env.B2_BUCKET;

    // The extension is not derivable from the id, so find the object once.
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const keys = new Map();
    let token;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: "originals/", ContinuationToken: token })
      );
      for (const o of page.Contents ?? []) {
        keys.set(o.Key.slice("originals/".length).replace(/\.[^.]+$/, ""), o.Key);
      }
      token = page.NextContinuationToken;
    } while (token);

    const queue = [...todo];
    let filled = 0, blank = 0, failed = 0;

    const worker = async () => {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        try {
          const key = keys.get(id);
          if (!key) { seen.add(id); blank++; continue; }

          const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          const source = Buffer.from(await obj.Body.transformToByteArray());
          const bibs = VISION_KEY ? await readBibsWithVision(source) : await readBibs(source);

          if (bibs.length) {
            // Re-read immediately before saving: the photographer may have
            // tagged this very photo while it was being scanned, and hers wins.
            const fresh = await readJson(CATALOGUE_FILE, {});
            const now = fresh[id];
            if (!now) { seen.add(id); continue; }
            if ((now.bibs ?? []).length || now.reviewed) { seen.add(id); continue; }

            await saveBibs(id, bibs);
            filled++;
            console.log(`  ${id} -> ${bibs.join(", ")}${DRY_RUN ? "  (not saved)" : ""}`);
          } else {
            blank++;
          }
          seen.add(id);
        } catch (err) {
          failed++;
          console.error(`  ${id} failed: ${err.message}`);
        }

        // Written as we go so a killed run does not redo everything.
        if (!DRY_RUN && (filled + blank + failed) % 20 === 0) await writeSeen([...seen]);
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (!DRY_RUN) await writeSeen([...seen]);

    console.log(`\ndone: ${filled} photos given a bib, ${blank} left blank, ${failed} failed`);
  } finally {
    await fs.rm(LOCK_FILE, { force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
