import sharp from "sharp";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

// Tries several ways of reading a bib against photos whose numbers are known,
// and prints how each one does. Reads only; writes nothing.
//
//   cd /srv/hkp/site && EVENT="Ironman Tallinn" SAMPLE=60 \
//     node --env-file=.env.local scripts/bib-ocr-tune.mjs
//
// Ground truth is photos the photographer has reviewed AND given a number to:
// she has looked at those and said what the bib is, so a disagreement is the
// reader being wrong rather than the record being incomplete.

const run = promisify(execFile);
const SAMPLE = Number(process.env.SAMPLE ?? 60);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2);
const EVENT = process.env.EVENT ?? "";
const DISCIPLINE = process.env.DISCIPLINE ?? "";
const CATALOGUE = process.env.CATALOGUE_FILE ?? "src/data/photos.json";

// Each variant is a different way of presenting the photo to tesseract. The
// point is to find which ones actually earn their place: every extra pass costs
// a second per photo, and three thousand photos is an hour a pass.
const VARIANTS = {
  plain: (img) => img.normalise(),
  hard: (img) => img.normalise().linear(1.8, -60).sharpen(),
  invert: (img) => img.normalise().negate().linear(1.6, -40),
  // A bib is dark ink on a light card. Clamping the mid-tones away leaves the
  // digits and drops most of the background before tesseract ever sees it.
  threshold: (img) => img.normalise().threshold(140),
  // The opposite polarity, for the races that print light-on-dark.
  thresholdInv: (img) => img.normalise().negate().threshold(140),
};

async function prepare(source, variant, scale) {
  const img = sharp(source).rotate().resize({ width: scale }).greyscale();
  return VARIANTS[variant](img).png().toBuffer();
}

async function ocr(file, psm) {
  const { stdout } = await run("tesseract", [
    file, "stdout", "--psm", String(psm),
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

function dropPartials(found) {
  return found.filter(
    (a) => !found.some((b) => b !== a && b.text.length > a.text.length && b.text.includes(a.text))
  );
}

async function readWith(source, { variants, scale, psm }) {
  const tmp = path.join(os.tmpdir(), `tune-${process.pid}-${Math.random().toString(36).slice(2)}.png`);
  const all = new Map();
  try {
    for (const v of variants) {
      await fs.writeFile(tmp, await prepare(source, v, scale));
      const seen = new Set();
      for (const { text, conf } of await ocr(tmp, psm)) {
        const prev = all.get(text);
        all.set(text, {
          conf: Math.max(prev?.conf ?? -1, conf),
          votes: (prev?.votes ?? 0) + (seen.has(text) ? 0 : 1),
        });
        seen.add(text);
      }
    }
  } finally {
    await fs.rm(tmp, { force: true });
  }
  return dropPartials([...all.entries()].map(([text, v]) => ({ text, ...v })));
}

const CONFIGS = [
  { name: "current (3 variants, 2000px, psm11)", variants: ["plain", "hard", "invert"], scale: 2000, psm: 11 },
  { name: "+ threshold passes",                  variants: ["plain", "hard", "invert", "threshold", "thresholdInv"], scale: 2000, psm: 11 },
  { name: "threshold only, 2000px",              variants: ["threshold", "thresholdInv"], scale: 2000, psm: 11 },
  { name: "+ threshold, 3000px",                 variants: ["plain", "hard", "threshold", "thresholdInv"], scale: 3000, psm: 11 },
  { name: "psm 6 (block of text)",               variants: ["plain", "hard", "invert"], scale: 2000, psm: 6 },
  { name: "psm 12 (sparse + orientation)",       variants: ["plain", "hard", "invert"], scale: 2000, psm: 12 },
];

const catalogue = JSON.parse(await fs.readFile(CATALOGUE, "utf-8"));
// Spread the sample across the whole shoot. Taking the first N walks straight
// into whatever was photographed first — for this race, the swim start, where
// the number is a wristband and nothing can read it. That is a fact about the
// morning, not about the reader.
const eligible = Object.entries(catalogue).filter(
  ([, v]) =>
    (!EVENT || v.event === EVENT) &&
    (!DISCIPLINE || v.discipline === DISCIPLINE) &&
    v.reviewed &&
    (v.bibs ?? []).length > 0
);
const step = Math.max(1, Math.floor(eligible.length / SAMPLE));
const truth = eligible.filter((_, i) => i % step === 0).slice(0, SAMPLE);

console.log(`${truth.length} of ${eligible.length} photos with a bib you confirmed by hand` +
  `${EVENT ? ` from "${EVENT}"` : ""}${DISCIPLINE ? `, ${DISCIPLINE} only` : ""}, sampled evenly\n`);

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT, region: process.env.B2_REGION,
  credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APP_KEY },
});
const bucket = process.env.B2_BUCKET;

const keys = new Map();
let token;
do {
  const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "originals/", ContinuationToken: token }));
  for (const o of page.Contents ?? []) keys.set(o.Key.slice(10).replace(/\.[^.]+$/, ""), o.Key);
  token = page.NextContinuationToken;
} while (token);

// Fetch each photo once and try every configuration on it, rather than pulling
// the same file out of the bucket for each one.
const sources = new Map();
{
  const queue = [...truth];
  const worker = async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const [id] = job;
      const key = keys.get(id);
      if (!key) continue;
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      sources.set(id, Buffer.from(await obj.Body.transformToByteArray()));
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}
console.log(`fetched ${sources.size} originals\n`);

for (const cfg of CONFIGS) {
  const results = [];
  const queue = truth.filter(([id]) => sources.has(id));
  const started = Date.now();
  const worker = async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const [id, meta] = job;
      results.push({ truth: meta.bibs.map(String), found: await readWith(sources.get(id), cfg) });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const perPhoto = (Date.now() - started) / results.length / 1000;
  console.log(`${cfg.name}   (${perPhoto.toFixed(1)}s per photo)`);
  console.log("   conf  votes   correct    wrong    blank");
  for (const votes of [1, 2]) {
    for (const conf of [60, 70, 80]) {
      let hit = 0, wrong = 0, blank = 0;
      for (const r of results) {
        const kept = r.found.filter((f) => f.conf >= conf && f.text.length >= 3 && f.votes >= votes).map((f) => f.text);
        if (!kept.length) { blank++; continue; }
        if (kept.some((k) => r.truth.includes(k))) hit++;
        if (kept.some((k) => !r.truth.includes(k))) wrong++;
      }
      const pc = (n) => `${((100 * n) / results.length).toFixed(0)}%`.padStart(4);
      console.log(`    ${conf}     ${votes}     ${pc(hit)}     ${pc(wrong)}    ${pc(blank)}`);
    }
  }
  console.log("");
}
