import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

// Rebuilds the watermarked preview + thumbnail for every photo in the
// catalogue, pulling each original back out of the B2 bucket.
//
// Why this exists: the renders are derived files, and they have been lost once
// already — `git clean -fd` in the app directory deleted all 254 of them while
// leaving the catalogue behind, so the gallery listed photos whose images all
// 404'd. Storage now lives outside the git tree so that cannot recur, but the
// originals are in the bucket either way, which makes the renders rebuildable
// from scratch at any time.
//
//   cd /srv/hkp/site && node --env-file=.env.local scripts/rebuild-renders.mjs
//
// Safe to re-run: it only ever writes files that are missing, and touches
// neither photos.json nor the bucket. Pass FORCE=1 to redo renders that
// already exist (e.g. after a watermark change).

const ROOT = path.resolve(import.meta.dirname, "..");
// Same defaults and same env vars as src/lib/storage.ts, so this script always
// reads and writes wherever the running app does.
const DATA_FILE = process.env.CATALOGUE_FILE
  ? path.resolve(process.env.CATALOGUE_FILE)
  : path.join(ROOT, "src", "data", "photos.json");
const RENDERS_DIR = process.env.RENDERS_DIR
  ? path.resolve(process.env.RENDERS_DIR)
  : path.join(ROOT, "public", "photos");
const PREVIEW_DIR = path.join(RENDERS_DIR, "preview");
const THUMB_DIR = path.join(RENDERS_DIR, "thumb");
const WATERMARK_PATH = path.join(ROOT, "public", "images", "watermark.png");
const KEY_PREFIX = "originals/";

// Two photos at a time: the box has 2 vCPUs, and sharp will happily use every
// core it can find on a single image.
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2);
const FORCE = process.env.FORCE === "1";

// These four numbers must stay identical to processUploadedPhoto() in
// src/lib/serverImage.ts, or a rebuilt photo won't match the width/height
// already recorded for it in photos.json and the gallery will lay it out
// against the wrong aspect box.
const PREVIEW_WIDTH = { portrait: 1100, landscape: 1600 };
const THUMB_WIDTH = { portrait: 700, landscape: 900 };
const PREVIEW_QUALITY = 80;
const THUMB_QUALITY = 76;

let watermarkPromise = null;
function watermark() {
  watermarkPromise ??= fs.readFile(WATERMARK_PATH);
  return watermarkPromise;
}

// A faithful copy of watermarked() from src/lib/serverImage.ts, down to the
// mozjpeg flag. The overlay is the pre-rendered PNG, never an SVG — libvips'
// SVG loader is unreliable in this runtime and fails on every composite.
async function watermarked(source, width, quality) {
  const base = await sharp(source)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const overlay = await sharp(await watermark())
    .resize(base.info.width, base.info.height, { fit: "cover" })
    .toBuffer();

  const buffer = await sharp(base.data)
    .composite([{ input: overlay }])
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  return { buffer, width: base.info.width, height: base.info.height };
}

function client() {
  const { B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_APP_KEY } = process.env;
  if (!B2_ENDPOINT || !B2_REGION || !B2_KEY_ID || !B2_APP_KEY) {
    throw new Error(
      "Object storage is not configured. Run this with --env-file=.env.local " +
        "from the app directory."
    );
  }
  return new S3Client({
    endpoint: B2_ENDPOINT,
    region: B2_REGION,
    credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
  });
}

// id -> full object key. The extension is whatever the photo was uploaded as,
// so the key can't be derived from the id alone.
async function listOriginals(s3, bucket) {
  const found = new Map();
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: KEY_PREFIX, ContinuationToken: token })
    );
    for (const object of page.Contents ?? []) {
      const id = object.Key.slice(KEY_PREFIX.length).replace(/\.[^.]+$/, "");
      if (id) found.set(id, object.Key);
    }
    token = page.NextContinuationToken;
  } while (token);
  return found;
}

async function exists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.size > 0;
  } catch {
    return false;
  }
}

async function main() {
  const catalogue = JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
  const ids = Object.keys(catalogue);
  const bucket = process.env.B2_BUCKET;
  const s3 = client();

  console.log(`catalogue: ${ids.length} photos`);
  const originals = await listOriginals(s3, bucket);
  console.log(`bucket:    ${originals.size} originals`);

  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  await fs.mkdir(THUMB_DIR, { recursive: true });

  const work = [];
  const orphaned = [];
  for (const id of ids) {
    if (!originals.has(id)) {
      orphaned.push(id);
      continue;
    }
    const previewFile = path.join(PREVIEW_DIR, `${id}.jpg`);
    const thumbFile = path.join(THUMB_DIR, `${id}.jpg`);
    if (!FORCE && (await exists(previewFile)) && (await exists(thumbFile))) continue;
    work.push({ id, key: originals.get(id), previewFile, thumbFile });
  }

  if (orphaned.length) {
    console.log(
      `\n${orphaned.length} catalogued photo(s) have no original in the bucket ` +
        `and cannot be rebuilt:\n  ${orphaned.join(", ")}`
    );
  }
  if (work.length === 0) {
    console.log("\nNothing to rebuild — every catalogued photo already has both renders.");
    return;
  }
  console.log(`\nrebuilding ${work.length} photo(s)...\n`);

  let done = 0;
  const failures = [];
  const mismatches = [];

  const worker = async () => {
    for (;;) {
      const job = work.shift();
      if (!job) return;
      try {
        const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: job.key }));
        const source = Buffer.from(await object.Body.transformToByteArray());

        const meta = await sharp(source).rotate().metadata();
        const orientation = (meta.height ?? 0) > (meta.width ?? 0) ? "portrait" : "landscape";

        const preview = await watermarked(source, PREVIEW_WIDTH[orientation], PREVIEW_QUALITY);
        const thumb = await watermarked(source, THUMB_WIDTH[orientation], THUMB_QUALITY);

        // Write to a temp name first, then rename: a half-written JPEG served
        // to a shopper is worse than a missing one, and rename is atomic.
        await fs.writeFile(`${job.previewFile}.tmp`, preview.buffer);
        await fs.rename(`${job.previewFile}.tmp`, job.previewFile);
        await fs.writeFile(`${job.thumbFile}.tmp`, thumb.buffer);
        await fs.rename(`${job.thumbFile}.tmp`, job.thumbFile);

        // photos.json already records the dimensions the gallery reserves space
        // with. They should match exactly; report it loudly if they don't.
        const stored = catalogue[job.id];
        if (
          stored.width !== preview.width ||
          stored.height !== preview.height ||
          stored.thumbWidth !== thumb.width ||
          stored.thumbHeight !== thumb.height
        ) {
          mismatches.push(
            `${job.id}: catalogue ${stored.width}x${stored.height} / ` +
              `${stored.thumbWidth}x${stored.thumbHeight}, rebuilt ` +
              `${preview.width}x${preview.height} / ${thumb.width}x${thumb.height}`
          );
        }

        done++;
        if (done % 25 === 0 || done === 1) console.log(`  ${done} rebuilt`);
      } catch (err) {
        failures.push(`${job.id}: ${err.message}`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\ndone: ${done} rebuilt, ${failures.length} failed`);
  if (mismatches.length) {
    console.log(`\n${mismatches.length} dimension mismatch(es):\n  ${mismatches.join("\n  ")}`);
  }
  if (failures.length) {
    console.log(`\nfailures:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
