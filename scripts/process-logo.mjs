import sharp from "sharp";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(ROOT, "..", "Media", "H_logo3.jpg");
const OUT_DIR = path.join(ROOT, "public", "images");

async function makeTintedLogo(color, outName) {
  const img = sharp(SRC).greyscale().trim();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = data[i];
    const alpha = 255 - v;
    rgba[i * 4] = color.r;
    rgba[i * 4 + 1] = color.g;
    rgba[i * 4 + 2] = color.b;
    rgba[i * 4 + 3] = alpha;
  }
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .resize({ width: 900, withoutEnlargement: true })
    .toFile(path.join(OUT_DIR, outName));
  console.log("wrote", outName, width, height);
}

await makeTintedLogo({ r: 0x14, g: 0x16, b: 0x2b }, "logo-ink.png");
await makeTintedLogo({ r: 0xff, g: 0xff, b: 0xff }, "logo-white.png");
