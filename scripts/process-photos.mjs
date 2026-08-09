import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC_DIR = path.resolve(ROOT, "..", "Media");
const PREVIEW_DIR = path.join(ROOT, "public", "photos", "preview");
const THUMB_DIR = path.join(ROOT, "public", "photos", "thumb");
const HERO_DIR = path.join(ROOT, "public", "photos", "hero");

// Photos used full-bleed as a page hero — high-res, no watermark (they're
// marketing chrome, not a purchasable listing image).
const HERO_FILES = ["DSC00009.JPG"];

const FILES = [
  "DSC00009.JPG",
  "DSC00017.JPG",
  "DSC00244.JPG",
  "DSC00298.JPG",
  "DSC00330.JPG",
  "DSC00470.JPG",
  "DSC00605.JPG",
  "DSC00680.JPG",
  "DSC00687.JPG",
  "DSC00721.JPG",
  "DSC00757.JPG",
  "DSC01051.JPG",
  "DSC01161.JPG",
  "DSC01205.JPG",
  "DSC01212 (1).JPG",
  "DSC01236.JPG",
  "DSC01351.JPG",
  "DSC09743.JPG",
  "DSC09775.JPG",
  "DSC09994.JPG",
];

function watermarkSvg(width, height) {
  const tile = Math.round(Math.max(width, height) / 3);
  const fontSize = Math.max(26, Math.round(tile * 0.16));
  return Buffer.from(`
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="wm" width="${tile}" height="${tile}" patternTransform="rotate(-30)" patternUnits="userSpaceOnUse">
        <text x="0" y="${tile / 2}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" fill-opacity="0.4" letter-spacing="2">h_kivimurd</text>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#wm)" />
  </svg>`);
}

async function processOne(file) {
  const srcPath = path.join(SRC_DIR, file);
  const id = file
    .replace(/\.JPG$/i, "")
    .replace(/\s*\(1\)/, "")
    .toLowerCase();

  const srcMeta = await sharp(srcPath).rotate().metadata();
  const isPortrait = (srcMeta.height ?? 0) > (srcMeta.width ?? 0);

  // Preview (large, for lightbox / detail view)
  const previewWidth = isPortrait ? 1100 : 1600;
  const previewBase = await sharp(srcPath)
    .rotate()
    .resize({ width: previewWidth, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const previewSvg = watermarkSvg(previewBase.info.width, previewBase.info.height);
  await sharp(previewBase.data)
    .composite([{ input: previewSvg }])
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(PREVIEW_DIR, `${id}.jpg`));

  // Thumb (grid card)
  const thumbWidth = isPortrait ? 700 : 900;
  const thumbBase = await sharp(srcPath)
    .rotate()
    .resize({ width: thumbWidth, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const thumbSvg = watermarkSvg(thumbBase.info.width, thumbBase.info.height);
  await sharp(thumbBase.data)
    .composite([{ input: thumbSvg }])
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(path.join(THUMB_DIR, `${id}.jpg`));

  console.log(
    id,
    "orig",
    srcMeta.width,
    srcMeta.height,
    "-> preview",
    previewBase.info.width,
    previewBase.info.height
  );

  return {
    id,
    width: previewBase.info.width,
    height: previewBase.info.height,
    thumbWidth: thumbBase.info.width,
    thumbHeight: thumbBase.info.height,
  };
}

async function processHero(file) {
  const srcPath = path.join(SRC_DIR, file);
  const id = file
    .replace(/\.JPG$/i, "")
    .replace(/\s*\(1\)/, "")
    .toLowerCase();

  const info = await sharp(srcPath)
    .rotate()
    .resize({ width: 2560, withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(HERO_DIR, `${id}.jpg`));

  console.log(id, "hero ->", info.width, info.height, "(no watermark)");
}

async function main() {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  await fs.mkdir(THUMB_DIR, { recursive: true });
  await fs.mkdir(HERO_DIR, { recursive: true });
  const results = [];
  for (const file of FILES) {
    results.push(await processOne(file));
  }
  for (const file of HERO_FILES) {
    await processHero(file);
  }
  await fs.writeFile(
    path.join(ROOT, "scripts", "photo-dimensions.json"),
    JSON.stringify(results, null, 2)
  );
  console.log("Done.", results.length, "photos processed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
