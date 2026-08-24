import sharp from "sharp";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

// Bike photos hide the number on a helmet sticker perhaps forty pixels wide.
// Contrast tricks do not help that — there simply are not enough pixels in the
// digits. What might is cutting the frame up and enlarging the pieces, so the
// sticker arrives at tesseract the size of ordinary print.
//
//   cd /srv/hkp/site && SAMPLE=40 node --env-file=.env.local scripts/bib-ocr-tune-bike.mjs
//
// Measured against bike photos whose numbers Helen has confirmed by hand.
// Reads only; writes nothing.

const run = promisify(execFile);
const SAMPLE = Number(process.env.SAMPLE ?? 40);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2);
const CATALOGUE = process.env.CATALOGUE_FILE ?? "src/data/photos.json";

async function ocr(file, psm = 11) {
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
    if (/^\d{2,4}$/.test(text)) out.push({ text, conf });
  }
  return out;
}

function merge(into, found, pass) {
  for (const { text, conf } of found) {
    const prev = into.get(text);
    into.set(text, {
      conf: Math.max(prev?.conf ?? -1, conf),
      votes: (prev?.votes ?? 0) + (prev?.lastPass === pass ? 0 : 1),
      lastPass: pass,
    });
  }
}

function dropPartials(found) {
  return found.filter(
    (a) => !found.some((b) => b !== a && b.text.length > a.text.length && b.text.includes(a.text))
  );
}

// Whole frame, as the reader works today.
async function whole(source, tmp, all) {
  let pass = 0;
  for (const prep of [
    (i) => i.normalise(),
    (i) => i.normalise().linear(1.8, -60).sharpen(),
    (i) => i.normalise().negate().linear(1.6, -40),
  ]) {
    await fs.writeFile(tmp, await prep(sharp(source).rotate().resize({ width: 2000 }).greyscale()).png().toBuffer());
    merge(all, await ocr(tmp), pass++);
  }
}

// The rider's head sits in the upper middle of a head-on bike shot, so that
// part of the frame is worth enlarging heavily on its own.
async function headCrop(source, tmp, all, factor) {
  const meta = await sharp(source).rotate().metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return;
  const region = {
    left: Math.round(w * 0.2),
    top: 0,
    width: Math.round(w * 0.6),
    height: Math.round(h * 0.55),
  };
  const buf = await sharp(source).rotate().extract(region)
    .resize({ width: Math.round(region.width * factor) })
    .greyscale().normalise().sharpen().png().toBuffer();
  await fs.writeFile(tmp, buf);
  merge(all, await ocr(tmp), 100 + factor);
}

// Overlapping tiles, each blown up. Slower, but it does not assume the number
// is anywhere in particular — a frame plate low on the bike gets the same
// treatment as a helmet.
async function tiles(source, tmp, all, cols, rows, factor) {
  const meta = await sharp(source).rotate().metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return;
  const tw = Math.floor(w / cols), th = Math.floor(h / rows);
  let pass = 200;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      // A tenth of a tile of overlap, so a number on a seam is not cut in half.
      const left = Math.max(0, Math.round(c * tw - tw * 0.1));
      const top = Math.max(0, Math.round(r * th - th * 0.1));
      const width = Math.min(w - left, Math.round(tw * 1.2));
      const height = Math.min(h - top, Math.round(th * 1.2));
      if (width < 40 || height < 40) continue;
      const buf = await sharp(source).rotate().extract({ left, top, width, height })
        .resize({ width: Math.round(width * factor) })
        .greyscale().normalise().sharpen().png().toBuffer();
      await fs.writeFile(tmp, buf);
      merge(all, await ocr(tmp), pass++);
    }
  }
}

const STRATEGIES = [
  { name: "current: whole frame, 2000px", fn: async (s, t, a) => whole(s, t, a) },
  { name: "head crop x2", fn: async (s, t, a) => headCrop(s, t, a, 2) },
  { name: "head crop x3", fn: async (s, t, a) => headCrop(s, t, a, 3) },
  { name: "whole + head crop x3", fn: async (s, t, a) => { await whole(s, t, a); await headCrop(s, t, a, 3); } },
  { name: "3x2 tiles x2", fn: async (s, t, a) => tiles(s, t, a, 3, 2, 2) },
  { name: "3x3 tiles x2", fn: async (s, t, a) => tiles(s, t, a, 3, 3, 2) },
];

const catalogue = JSON.parse(await fs.readFile(CATALOGUE, "utf-8"));
const eligible = Object.entries(catalogue).filter(
  ([, v]) => v.discipline === "Bike" && v.reviewed && (v.bibs ?? []).length > 0
);
const step = Math.max(1, Math.floor(eligible.length / SAMPLE));
const truth = eligible.filter((_, i) => i % step === 0).slice(0, SAMPLE);
console.log(`${truth.length} of ${eligible.length} bike photos with a bib you confirmed, sampled evenly\n`);

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

const sources = new Map();
{
  const q = [...truth];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (;;) {
      const job = q.shift();
      if (!job) return;
      const key = keys.get(job[0]);
      if (!key) continue;
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      sources.set(job[0], Buffer.from(await obj.Body.transformToByteArray()));
    }
  }));
}
console.log(`fetched ${sources.size} originals\n`);

for (const strat of STRATEGIES) {
  const results = [];
  const q = truth.filter(([id]) => sources.has(id));
  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const job = q.shift();
      if (!job) return;
      const [id, meta] = job;
      const tmp = path.join(os.tmpdir(), `bike-${process.pid}-${Math.random().toString(36).slice(2)}.png`);
      const all = new Map();
      try {
        await strat.fn(sources.get(id), tmp, all);
      } finally {
        await fs.rm(tmp, { force: true });
      }
      results.push({
        truth: meta.bibs.map(String),
        found: dropPartials([...all.entries()].map(([text, v]) => ({ text, conf: v.conf, votes: v.votes }))),
      });
    }
  }));

  console.log(`${strat.name}   (${((Date.now() - started) / results.length / 1000).toFixed(1)}s per photo)`);
  console.log("   conf   correct    wrong    blank");
  for (const conf of [60, 70, 80]) {
    let hit = 0, wrong = 0, blank = 0;
    for (const r of results) {
      const kept = r.found.filter((f) => f.conf >= conf && f.text.length >= 3).map((f) => f.text);
      if (!kept.length) { blank++; continue; }
      if (kept.some((k) => r.truth.includes(k))) hit++;
      if (kept.some((k) => !r.truth.includes(k))) wrong++;
    }
    const pc = (n) => `${((100 * n) / results.length).toFixed(0)}%`.padStart(5);
    console.log(`    ${conf}    ${pc(hit)}    ${pc(wrong)}   ${pc(blank)}`);
  }
  console.log("");
}
