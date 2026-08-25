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
const CATALOGUE = process.env.CATALOGUE_FILE ?? "src/data/photos.json";
const VISITS_DIR = process.env.ANALYTICS_DIR ?? path.join(path.dirname(CATALOGUE), "visits");
const TARGETS = {
  "photos.json": CATALOGUE,
  "orders.json": process.env.ORDERS_FILE ?? "src/data/orders.json",
};

// Visit logs are named "visits/<month>.jsonl" in the bucket and go back into the
// visits directory. They are lines rather than one object, and losing a day of
// them costs a number on a chart rather than anyone's work, so they are put back
// plainly without the comparison the other two get.
const isLog = (name) => name.startsWith("visits/") && name.endsWith(".jsonl");
const logTarget = (name) => path.join(VISITS_DIR, path.basename(name));

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
  const rest = o.Key.slice(PREFIX.length);
  const d = rest.split("/")[0];
  const name = rest.slice(d.length + 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? "") || !name) continue;
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

// Everything is fetched and judged before anything is written. Restoring one
// file and then refusing the next would leave the two disagreeing about the
// same day, which is a worse place to be than either of them alone.
const planned = [];
for (const f of files) {
  const target = isLog(f.name) ? logTarget(f.name) : TARGETS[f.name];
  if (!target) {
    console.log(`  ${f.name}: not a file this script knows how to place, skipped`);
    continue;
  }
  const obj = await s3.send(new GetObjectCommand({ Bucket, Key: f.Key }));
  const body = Buffer.from(await obj.Body.transformToByteArray());

  // Whatever comes out of the bucket is checked before it is allowed to stand
  // in for the real thing.
  let stored, count;
  try {
    if (isLog(f.name)) {
      const lines = body.toString("utf-8").split("\n").filter(Boolean);
      lines.forEach((l) => JSON.parse(l));
      stored = null;
      count = lines.length;
    } else {
      stored = JSON.parse(body.toString("utf-8"));
      count = Object.keys(stored).length;
    }
  } catch {
    console.error(`  ${f.name}: the stored copy is not valid — stopping`);
    process.exit(1);
  }
  planned.push({ name: f.name, target, body, stored, count, log: isLog(f.name) });
}

// An in-place restore undoes everything done since that backup was taken. That
// is the whole point when the file is ruined, and a disaster when it is merely
// a day old — so say exactly what would be lost, and stop.
if (inPlace && !process.argv.includes("--yes")) {
  let blocked = false;
  for (const p of planned) {
    if (p.log) continue;
    let live;
    try {
      live = JSON.parse(await fs.readFile(p.target, "utf-8"));
    } catch {
      continue; // nothing there to lose
    }
    const changed = Object.keys(live).filter(
      (k) => JSON.stringify(live[k]) !== JSON.stringify(p.stored[k])
    );
    const gone = Object.keys(live).filter((k) => !(k in p.stored));
    if (!changed.length && !gone.length) continue;
    blocked = true;
    console.error(`\n  ${p.name}: this would undo work.`);
    console.error(`    ${changed.length} entr(ies) differ from the copy on disk`);
    if (gone.length) console.error(`    ${gone.length} would disappear entirely`);
    for (const k of changed.slice(0, 10)) {
      const title = live[k]?.title ?? k;
      console.error(`      ${title}: now      ${JSON.stringify(live[k])}`);
      console.error(`      ${" ".repeat(title.length)}  back to ${JSON.stringify(p.stored[k])}`);
    }
    if (changed.length > 10) console.error(`      ... and ${changed.length - 10} more`);
  }
  if (blocked) {
    console.error(`\n    Nothing was changed. Add --yes if that is really what you want.`);
    process.exit(1);
  }
}

for (const p of planned) {
  if (p.log) await fs.mkdir(path.dirname(p.target), { recursive: true });
  if (!inPlace) {
    const beside = `${p.target}.from-${day}`;
    await fs.writeFile(beside, p.body);
    console.log(`  ${p.name}: ${p.count} ${p.log ? "events" : "entries"} written to ${beside} (nothing replaced)`);
    continue;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const saved = `${p.target}.replaced-${stamp}`;
  try {
    await fs.copyFile(p.target, saved);
    console.log(`  ${p.name}: what was there is kept as ${path.basename(saved)}`);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  // Written whole and swapped in, so the app never reads a half-written file.
  const tmp = `${p.target}.tmp-restore`;
  await fs.writeFile(tmp, p.body);
  await fs.rename(tmp, p.target);
  console.log(`  ${p.name}: ${p.count} ${p.log ? "events" : "entries"} restored into ${p.target}`);
}

if (inPlace) console.log("\nRestart the site so it reads the restored file:  systemctl restart hkp");
