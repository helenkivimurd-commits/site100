// Copies the small files that hold Helen's work into Backblaze, next to the
// photos.
//
//   node --env-file=.env.local scripts/backup-data.mjs
//
// The photographs themselves are already safe: 23GB of originals sit in the
// bucket and can always be downloaded again. What has no second copy is the
// work done to them — every bib number typed by hand, every photo marked as
// having no readable number, which album each one belongs to, and the record of
// what people have bought. That lives in two small files on one machine. A dead
// disk, or one careless command, and there is nothing to rebuild it from: the
// originals cannot tell you who is in them.
//
// So: one copy per day, kept for a month, verified by reading it back. Restore
// with scripts/restore-data.mjs.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS ?? 30);
const PREFIX = "backups/";

const CATALOGUE = process.env.CATALOGUE_FILE ?? "src/data/photos.json";
const ORDERS = process.env.ORDERS_FILE ?? "src/data/orders.json";
const VISITS_DIR = process.env.ANALYTICS_DIR ?? path.join(path.dirname(CATALOGUE), "visits");

// Whole JSON files, checked by parsing them.
const FILES = [CATALOGUE, ORDERS];

// The visit log is one file per month of newline-separated events. The salt is
// deliberately NOT copied: it is destroyed and replaced every night so that
// past visitor hashes can never be turned back into people. Storing it beside
// the events it scrambled would hand back exactly what throwing it away
// protects — so if this is ever restored, the counts come back and the
// anonymity stays intact.
async function visitLogs() {
  try {
    const names = await fs.readdir(VISITS_DIR);
    return names.filter((n) => n.endsWith(".jsonl")).map((n) => path.join(VISITS_DIR, n));
  } catch {
    return [];
  }
}

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
// Named for the day in Estonia, so asking to restore "the 26th" means the 26th
// as she lived it. The job runs at 03:30 local, which is the previous day in
// UTC — naming folders by UTC would have filed each night's copy under
// yesterday.
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Tallinn", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APP_KEY },
});
const Bucket = process.env.B2_BUCKET;
if (!Bucket) {
  console.error("B2_BUCKET is not set — nothing to back up to.");
  process.exit(1);
}

let failed = false;

const logs = await visitLogs();

for (const file of [...FILES, ...logs]) {
  const isLog = logs.includes(file);
  const name = isLog ? `visits/${path.basename(file)}` : path.basename(file);
  let body;
  try {
    body = await fs.readFile(file);
  } catch (err) {
    // A missing orders file on a shop that has sold nothing yet is normal, and
    // must not stop the catalogue from being saved.
    console.log(`  ${name}: not on disk, skipped (${err.code})`);
    continue;
  }

  // Never store a file that has stopped being readable. A backup of rubbish
  // looks like a backup right up until the day it is needed.
  try {
    if (isLog) {
      // One event per line. A crash can leave the last line half written, and
      // that costs that line rather than the month.
      const lines = body.toString("utf-8").split("\n").filter(Boolean);
      for (const line of lines.slice(0, -1)) JSON.parse(line);
    } else {
      JSON.parse(body.toString("utf-8"));
    }
  } catch {
    console.error(`  ${name}: NOT VALID — refusing to store it`);
    failed = true;
    continue;
  }

  const Key = `${PREFIX}${today}/${name}`;
  const want = sha(body);
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType: "application/json" }));

  // Read it back. An upload that reported success and stored something else is
  // the one failure this whole script exists to prevent.
  const back = await s3.send(new GetObjectCommand({ Bucket, Key }));
  const got = sha(Buffer.from(await back.Body.transformToByteArray()));
  if (got !== want) {
    console.error(`  ${name}: stored copy does not match the original — backup FAILED`);
    failed = true;
    continue;
  }
  console.log(`  ${name}: ${(body.length / 1024).toFixed(0)}KB stored and verified`);
}

// Drop anything past its month. Done after the new copy is safely stored, so a
// failure today never leaves fewer copies than yesterday.
const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
let removed = 0, kept = new Set(), token;
do {
  const page = await s3.send(
    new ListObjectsV2Command({ Bucket, Prefix: PREFIX, ContinuationToken: token })
  );
  for (const obj of page.Contents ?? []) {
    const day = obj.Key.slice(PREFIX.length).split("/")[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (day < cutoff) {
      await s3.send(new DeleteObjectCommand({ Bucket, Key: obj.Key }));
      removed++;
    } else kept.add(day);
  }
  token = page.NextContinuationToken;
} while (token);

console.log(`  ${kept.size} day(s) of backups held, ${removed} expired copy(ies) removed`);
process.exit(failed ? 1 : 0);
