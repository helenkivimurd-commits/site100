import fs from "node:fs/promises";
import sharp from "sharp";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

// Measures Google Cloud Vision against photos whose bib numbers Helen has
// confirmed by hand, so it can be compared with tesseract on exactly the same
// photos rather than on a claim from a pricing page.
//
//   cd /srv/hkp/site && DISCIPLINE=Bike SAMPLE=60 \
//     node --env-file=.env.local scripts/bib-ocr-vision.mjs
//
// Costs money — one API call per photo — so it defaults to a small sample and
// prints the bill before it starts. Reads only; changes nothing.

const SAMPLE = Number(process.env.SAMPLE ?? 50);
const DISCIPLINE = process.env.DISCIPLINE ?? "";
const EVENT = process.env.EVENT ?? "";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const CATALOGUE = process.env.CATALOGUE_FILE ?? "src/data/photos.json";
const KEY = process.env.GOOGLE_VISION_API_KEY;

// Google charges per image, not per pixel, so there is no reason to send a
// downscaled one — but there is a size limit on the request, and a 17MB camera
// JPEG base64-encoded is larger still. 2500px keeps small text intact while
// staying comfortably inside it.
const SEND_WIDTH = 2500;

if (!KEY) {
  console.error("GOOGLE_VISION_API_KEY is not set. Run scripts/set-vision-key.sh first.");
  process.exit(1);
}

// TEXT_DETECTION is the scene-text model — words on objects in a photograph,
// which is what a bib is. DOCUMENT_TEXT_DETECTION assumes a page of prose and
// does worse on a number stuck to a helmet.
async function readWithVision(jpeg, feature) {
  const body = {
    requests: [
      {
        image: { content: jpeg.toString("base64") },
        features: [{ type: feature }],
        imageContext: { languageHints: ["en"] },
      },
    ],
  };
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const err = json.responses?.[0]?.error;
  if (err) throw new Error(err.message ?? "vision error");

  // Every separate piece of text it found, reduced to the ones shaped like a
  // bib. The first annotation is the whole block, so it is skipped.
  const width = json.responses?.[0]?.fullTextAnnotation?.pages?.[0]?.width ?? SEND_WIDTH;
  const words = (json.responses?.[0]?.textAnnotations ?? []).slice(1);
  const out = new Map();
  for (const w of words) {
    const text = (w.description ?? "").trim();
    const ys = (w.boundingPoly?.vertices ?? []).map((v) => v.y ?? 0);
    const xs = (w.boundingPoly?.vertices ?? []).map((v) => v.x ?? 0);
    const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    // How far from the middle of the frame, 0 at the centre and 1 at an edge.
    // The rider is the subject and sits centrally; hoardings and other
    // competitors are pushed out to the sides.
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : width / 2;
    const offCentre = Math.abs(cx - width / 2) / (width / 2);
    // A number may arrive glued to something else ("845GIRO"); pull the digits.
    for (const run of text.split(/\D+/)) {
      if (!/^\d{2,4}$/.test(run)) continue;
      // Keep the largest sighting of each number.
      const prev = out.get(run);
      if (!prev || prev.height < height) out.set(run, { height, offCentre });
    }
  }
  return [...out.entries()]
    .map(([text, v]) => ({ text, ...v }))
    .sort((a, b) => b.height - a.height);
}

function dropPartials(found) {
  return found.filter(
    (a) => !found.some((b) => b !== a && b.text.length > a.text.length && b.text.includes(a.text))
  );
}

const catalogue = JSON.parse(await fs.readFile(CATALOGUE, "utf-8"));
const eligible = Object.entries(catalogue).filter(
  ([, v]) =>
    (!EVENT || v.event === EVENT) &&
    (!DISCIPLINE || v.discipline === DISCIPLINE) &&
    v.reviewed &&
    (v.bibs ?? []).length > 0
);
const step = Math.max(1, Math.floor(eligible.length / SAMPLE));
const truth = eligible.filter((_, i) => i % step === 0).slice(0, SAMPLE);

const features = ["TEXT_DETECTION", "DOCUMENT_TEXT_DETECTION"];
const calls = truth.length * features.length;
console.log(`${truth.length} of ${eligible.length} confirmed photos${DISCIPLINE ? `, ${DISCIPLINE} only` : ""}`);
console.log(`${calls} API calls — roughly $${((calls / 1000) * 1.5).toFixed(2)}, and the first 1000 a month are free\n`);

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

const results = [];
const queue = [...truth];
let done = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const [id, meta] = job;
      const key = keys.get(id);
      if (!key) continue;
      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const source = Buffer.from(await obj.Body.transformToByteArray());
        const jpeg = await sharp(source).rotate().resize({ width: SEND_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: 90 }).toBuffer();

        const row = { id, truth: meta.bibs.map(String) };
        for (const feature of features) {
          row[feature] = dropPartials(await readWithVision(jpeg, feature));
        }
        results.push(row);
      } catch (err) {
        console.error(`  ${id}: ${err.message}`);
      }
      if (++done % 10 === 0) console.log(`  ${done}/${truth.length}`);
    }
  })
);

console.log("");
// Vision usually reads the bib AND something else in the frame — another
// rider's number, a hoarding, a wheel decal. Taking everything it says gives a
// high hit rate and a lot of noise, so what matters is how to choose.
const STRATEGIES = [
  { name: "everything it read", pick: (c) => c },
  { name: "the biggest number only", pick: (c) => c.slice(0, 1) },
  { name: "only what is near the middle", pick: (c) => c.filter((x) => x.offCentre < 0.45) },
  { name: "biggest of those near the middle", pick: (c) => c.filter((x) => x.offCentre < 0.45).slice(0, 1) },
  { name: "near middle, 3-4 digits", pick: (c) => c.filter((x) => x.offCentre < 0.45 && x.text.length >= 3) },
  { name: "near middle, 3-4 digits, biggest", pick: (c) => c.filter((x) => x.offCentre < 0.45 && x.text.length >= 3).slice(0, 1) },
];

for (const feature of features) {
  console.log(feature);
  console.log("   choice                              correct   wrong   blank");
  for (const strat of STRATEGIES) {
    let hit = 0, wrong = 0, blank = 0;
    for (const r of results) {
      const kept = strat.pick(r[feature] ?? []).map((c) => c.text);
      if (!kept.length) { blank++; continue; }
      if (kept.some((k) => r.truth.includes(k))) hit++;
      if (kept.some((k) => !r.truth.includes(k))) wrong++;
    }
    const pc = (n) => `${((100 * n) / results.length).toFixed(0)}%`.padStart(6);
    console.log(`   ${strat.name.padEnd(34)}${pc(hit)}  ${pc(wrong)}  ${pc(blank)}`);
  }
  console.log("");
}

console.log("\nfirst 12 in detail:");
for (const r of results.slice(0, 12)) {
  const cands = r.TEXT_DETECTION ?? [];
  const got = cands.slice(0, 4).map((c) => `${c.text}(h${c.height} off${c.offCentre.toFixed(2)})`).join(" ") || "-";
  const ok = cands[0] && r.truth.includes(cands[0].text);
  console.log(`  ${ok ? "hit " : "miss"} ${r.id.padEnd(12)} tagged ${r.truth.join(",").padEnd(12)} read: ${got}`);
}
