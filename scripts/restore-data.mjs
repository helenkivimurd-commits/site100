// Puts back a file saved by scripts/backup-data.mjs.
//
//   node --env-file=.env.local scripts/restore-data.mjs
//       list the days available
//   node --env-file=.env.local scripts/restore-data.mjs 2026-08-25
//       fetch that day's copies next to the real ones, changing nothing
//   node --env-file=.env.local scripts/restore-data.mjs 2026-08-25 --in-place
//       actually swap them in, keeping what is there now
//
// Nothing is overwritten without --in-place, and even then the file being
// replaced is kept first. Restoring the wrong day should cost a rename, never
// the work itself.

import fs from "node:fs/promises";
import path from "node:path";
import {
  S3Client, GetObjectCommand, ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const PREFIX = "backups/";
const TARGETS = {
  "photos.json": process.env.CATALOGUE_FILE ?? "src/data/photos.json",
  "orders.json": process.env.ORDERS_FILE ?? "src/data/orders.json",
};

const day = process.argv[2];
const inPlace = process.argv.includes("--in-place");

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APP_KEY },
});
const Bucket = process.env.B2_BUCKET;

const objects = [];
let token;
do {
  const page = await s3.send(
    new ListObjectsV2Command({ Bucket, Prefix: PREFIX, ContinuationToken: token })
  );
  objects.push(...(page.Contents ?? []));
  token = page.NextContinuationToken;
} while (token);

const days = new Map();
for (const o of objects) {
  const [d, name] = o.Key.slice(PREFIX.length).split("/");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? "")) continue;
  if (!days.has(d)) days.set(d, []);
  days.get(d).push({ name, size: o.Size, Key: o.Key });
}

if (!day) {
  if (!days.size) {
    console.log("No backups stored yet.");
    process.exit(0);
  }
  console.log("Backups available:\n");
  for (const d of [...days.keys()].sort().reverse()) {
    const parts = days.get(d).map((f) => `${f.name} ${(f.size / 1024).toFixed(0)}KB`);
    console.log(`  ${d}   ${parts.join(", ")}`);
  }
  console.log("\nRestore one with:  node --env-file=.env.local scripts/restore-data.mjs <day>");
  process.exit(0);
}

const files = days.get(day);
if (!files) {
  console.error(`No backup for ${day}. Run without a day to see what there is.`);
  process.exit(1);
}

for (const f of files) {
  const target = TARGETS[f.name];
  if (!target) {
    console.log(`  ${f.name}: not a file this script knows how to place, skipped`);
    continue;
  }
  const obj = await s3.send(new GetObjectCommand({ Bucket, Key: f.Key }));
  const body = Buffer.from(await obj.Body.transformToByteArray());

  // Whatever comes out of the bucket is checked before it is allowed to stand
  // in for the real thing.
  let count = "?";
  try {
    count = Object.keys(JSON.parse(body.toString("utf-8"))).length;
  } catch {
    console.error(`  ${f.name}: the stored copy is not valid JSON — stopping`);
    process.exit(1);
  }

  if (!inPlace) {
    const beside = `${target}.from-${day}`;
    await fs.writeFile(beside, body);
    console.log(`  ${f.name}: ${count} entries written to ${beside} (nothing replaced)`);
    continue;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const saved = `${target}.replaced-${stamp}`;
  try {
    await fs.copyFile(target, saved);
    console.log(`  ${f.name}: what was there is kept as ${path.basename(saved)}`);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  // Written whole and swapped in, so the app never reads a half-written file.
  const tmp = `${target}.tmp-restore`;
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, target);
  console.log(`  ${f.name}: ${count} entries restored into ${target}`);
}

if (inPlace) console.log("\nRestart the site so it reads the restored file:  systemctl restart hkp");
