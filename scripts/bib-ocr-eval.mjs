import sharp from "sharp";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Measures how well bib numbers can be read automatically, against photos whose
// bib numbers are already known because they were tagged by hand.
//
//   cd /srv/hkp/site && node --env-file=.env.local scripts/bib-ocr-eval.mjs
//   SAMPLE=60 node --env-file=.env.local scripts/bib-ocr-eval.mjs
//
// Reads nothing but the bucket and the catalogue, and writes nothing at all.
// The point is an honest accuracy number before any of this goes near an
// upload: a wrong bib is worse than a blank one, because it sells a runner a
// photograph of a stranger.

const run = promisify(execFile);

const SAMPLE = Number(process.env.SAMPLE ?? 40);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2);

const DATA_FILE = process.env.CATALOGUE_FILE ?? "src/data/photos.json";

function client() {
  return new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: process.env.B2_REGION,
    credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APP_KEY },
  });
}

// Race bibs are dark digits on a light rectangle. Working at a decent size with
// the contrast pushed hard gives tesseract a much better chance than handing it
// a full-colour photo of a field and a sky.
const SCALE = Number(process.env.SCALE ?? 3000);

async function prepare(source, variant) {
  // Tesseract wants characters roughly 30px tall. A bib fills a small part of
  // the frame, so the photo is scaled UP rather than down — at native size the
  // digits are simply too few pixels to resolve.
  const base = sharp(source).rotate().resize({ width: SCALE }).greyscale();

  if (variant === "plain") return base.normalise().png().toBuffer();
  if (variant === "hard") return base.normalise().linear(1.8, -60).sharpen().png().toBuffer();
  if (variant === "invert") return base.normalise().negate().linear(1.6, -40).png().toBuffer();
  throw new Error(`unknown variant ${variant}`);
}

// A bib read as "26" when it is really "264" is the commonest failure: part of
// the number is behind an arm, or tesseract clips it. Where a photo yields both,
// the longer read supersedes the shorter one it contains — otherwise every hit
// drags a phantom number along with it.
function dropPartials(found) {
  return found.filter(
    (a) => !found.some((b) => b !== a && b.text.length > a.text.length && b.text.includes(a.text))
  );
}

// psm 11 finds sparse text anywhere in the frame, which is what a bib is.
// The whitelist stops letters being reported where digits were meant.
async function ocrDigits(pngPath) {
  const { stdout } = await run("tesseract", [
    pngPath, "stdout",
    "--psm", "11",
    "-c", "tessedit_char_whitelist=0123456789",
    "tsv",
  ]).catch(() => ({ stdout: "" }));

  const found = [];
  for (const line of stdout.split("\n").slice(1)) {
    const f = line.split("\t");
    if (f.length < 12) continue;
    const conf = Number(f[10]);
    const text = (f[11] ?? "").trim();
    if (!text || Number.isNaN(conf) || conf < 0) continue;
    // Bibs at this race run 1-4 digits. Anything longer is a timing board, a
    // sponsor hoarding or noise.
    // Single digits are almost always noise — a race number, a sponsor board,
    // a bit of texture. Only 3 bibs in the whole catalogue are one digit.
    if (!/^\d{2,4}$/.test(text)) continue;
    found.push({ text, conf });
  }
  return found;
}

async function readBibs(source) {
  const tmp = path.join(os.tmpdir(), `bib-${process.pid}-${Math.random().toString(36).slice(2)}.png`);
  const all = new Map();
  try {
    for (const variant of ["plain", "hard", "invert"]) {
      await fs.writeFile(tmp, await prepare(source, variant));
      const seen = new Set();
      for (const { text, conf } of await ocrDigits(tmp)) {
        // Keep the best confidence seen for a number, and count how many of the
        // three passes found it at all. A real bib survives being sharpened or
        // inverted; a shadow that happens to look like a digit usually does not.
        const prev = all.get(text);
        const votes = (prev?.votes ?? 0) + (seen.has(text) ? 0 : 1);
        seen.add(text);
        all.set(text, { conf: Math.max(prev?.conf ?? -1, conf), votes });
      }
    }
  } finally {
    await fs.rm(tmp, { force: true });
  }
  const merged = [...all.entries()].map(([text, v]) => ({ text, conf: v.conf, votes: v.votes }))
    .sort((a, b) => b.conf - a.conf);
  return dropPartials(merged);
}

const catalogue = JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
const known = Object.entries(catalogue)
  .filter(([, v]) => (v.bibs ?? []).length > 0)
  .slice(0, SAMPLE);

console.log(`evaluating ${known.length} photos whose bibs were tagged by hand\n`);

const s3 = client();
const bucket = process.env.B2_BUCKET;
const results = [];
const queue = [...known];
let done = 0;

const worker = async () => {
  for (;;) {
    const job = queue.shift();
    if (!job) return;
    const [id, meta] = job;
    const started = Date.now();
    try {
      const key = `originals/${id}.jpeg`;
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const source = Buffer.from(await obj.Body.transformToByteArray());
      const found = await readBibs(source);
      results.push({ id, truth: meta.bibs.map(String), found, ms: Date.now() - started });
    } catch (err) {
      results.push({ id, truth: meta.bibs.map(String), found: [], ms: Date.now() - started, error: err.message });
    }
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${known.length}`);
  }
};
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Score at a range of confidence cut-offs. The one worth shipping is the
// lowest cut-off that still almost never proposes a wrong number.
// Score across both dials that matter: how sure tesseract has to be, and how
// many digits a read must have. Short reads are the dangerous ones — they are
// usually a longer bib with part of it hidden, and a two-digit fragment can
// exactly match some other runner's real number.
console.log("min  min  min   photos with     photos with a      photos");
console.log("conf dig  pass  a correct bib   WRONG number       left blank");
for (const minVotes of [1, 2]) {
  for (const min of [60, 70, 80, 85]) {
    let hit = 0, wrongPhotos = 0, blank = 0;
    for (const r of results) {
      const kept = r.found
        .filter((f) => f.conf >= min && f.text.length >= 3 && f.votes >= minVotes)
        .map((f) => f.text);
      if (kept.length === 0) { blank++; continue; }
      if (kept.some((k) => r.truth.includes(k))) hit++;
      if (kept.some((k) => !r.truth.includes(k))) wrongPhotos++;
    }
    const pct = (n) => `${((100 * n) / results.length).toFixed(0)}%`;
    console.log(
      `${String(min).padStart(3)}  3    ${minVotes}     ${String(hit).padStart(3)} (${pct(hit).padStart(4)})` +
        `        ${String(wrongPhotos).padStart(3)} (${pct(wrongPhotos).padStart(4)})` +
        `          ${String(blank).padStart(3)} (${pct(blank)})`
    );
  }
  console.log("");
}

const times = results.map((r) => r.ms).sort((a, b) => a - b);
console.log(`\nper photo: median ${(times[Math.floor(times.length / 2)] / 1000).toFixed(1)}s, ` +
  `slowest ${(times[times.length - 1] / 1000).toFixed(1)}s`);
console.log(`for 3000 photos that is roughly ${((times.reduce((a, b) => a + b, 0) / times.length) * 3000 / 1000 / 3600).toFixed(1)} hours of CPU at this concurrency`);

console.log("\nfirst 12 photos in detail:");
for (const r of results.slice(0, 12)) {
  const top = r.found.slice(0, 4).map((f) => `${f.text}(${f.conf.toFixed(0)})`).join(" ");
  const ok = r.found.some((f) => r.truth.includes(f.text));
  console.log(`  ${ok ? "hit " : "miss"} ${r.id.padEnd(12)} tagged ${r.truth.join(",").padEnd(14)} read: ${top || "-"}`);
}
