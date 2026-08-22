import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

// Draws the tiled watermark that gets composited over every preview and
// thumbnail, and writes it to public/images/watermark.png.
//
//   node scripts/make-watermark.mjs
//   WATERMARK_TEXT="something else" node scripts/make-watermark.mjs
//
// Run this on a Mac or any machine with fonts, NOT on the server: it draws the
// text with librsvg, and libvips' SVG loader is unreliable inside Next's
// server runtime — it failed on every composite in production. Rendering to a
// PNG here and committing that PNG is what keeps SVG out of the upload path.
//
// After regenerating, existing photos keep their old watermark until their
// renders are rebuilt:
//
//   cd /srv/hkp/site && FORCE=1 node --env-file=.env.local scripts/rebuild-renders.mjs

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "images", "watermark.png");

const TEXT = process.env.WATERMARK_TEXT ?? "helenkivimurd.com";

// Matched to the watermark this replaces, measured off the original PNG:
// 2560px square, white at 40%, text on a 30° diagonal, ~4.6% ink coverage.
// Keeping those identical means the new watermark reads at the same strength
// as the old one on the same photos.
const SIZE = 2560;
const ANGLE = -30;
const COLOUR = "#ffffff";
const OPACITY = 0.4;
const FONT = "Helvetica, Arial, Helvetica Neue, sans-serif";

// Tuned so coverage lands near the original's 4.6%. The new text is longer
// than the old one, so it is set slightly smaller and spaced a little wider
// to avoid reading as a denser, heavier watermark than before.
const FONT_SIZE = Number(process.env.WATERMARK_FONT_SIZE ?? 58);
const LINE_PITCH = Number(process.env.WATERMARK_LINE_PITCH ?? 340);
const WORD_GAP = Number(process.env.WATERMARK_WORD_GAP ?? 90);

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Renders the string on its own so the tiling can be laid out against its real
// width rather than a guess from the character count.
async function measureText() {
  const probe = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="400">` +
      `<text x="20" y="300" font-family="${FONT}" font-weight="bold" font-size="${FONT_SIZE}" ` +
      `fill="#ffffff">${escapeXml(TEXT)}</text></svg>`
  );
  const { data, info } = await sharp(probe).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("The text rendered as nothing — the font did not resolve.");
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

function buildSvg(textWidth) {
  const step = textWidth + WORD_GAP;
  // The rotated grid has to cover the square's corners, so it is drawn well
  // beyond the canvas on every side and clipped by the viewport.
  const from = -SIZE;
  const to = SIZE * 2;

  const rows = [];
  let row = 0;
  for (let y = from; y < to; y += LINE_PITCH, row++) {
    // Every other row is offset by half a step so the repeats do not line up
    // into visible vertical lanes.
    const offset = (row % 2) * (step / 2);
    for (let x = from + offset; x < to; x += step) {
      rows.push(
        `<text x="${x}" y="${y}" font-family="${FONT}" font-weight="bold" ` +
          `font-size="${FONT_SIZE}" fill="${COLOUR}" fill-opacity="${OPACITY}">${escapeXml(TEXT)}</text>`
      );
    }
  }

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
      `<g transform="rotate(${ANGLE} ${SIZE / 2} ${SIZE / 2})">${rows.join("")}</g>` +
      `</svg>`
  );
}

// Ink coverage and the levelling angle are how this is checked against the
// watermark it replaces, rather than by eye alone.
async function describe(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  let ink = 0, maxAlpha = 0;
  for (let i = 0; i < total; i++) {
    const a = data[i * info.channels + 3];
    if (a > 30) ink++;
    if (a > maxAlpha) maxAlpha = a;
  }

  let best = null;
  for (let deg = -45; deg <= 45; deg += 1) {
    const r = await sharp(file)
      .rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extract({ left: 500, top: 500, width: 1200, height: 1200 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const W = r.info.width, H = r.info.height, ch = r.info.channels;
    const counts = new Array(H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (r.data[(y * W + x) * ch + 3] > 30) counts[y]++;
    const mean = counts.reduce((a, b) => a + b, 0) / H;
    const varr = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / H;
    if (!best || varr > best.varr) best = { deg, varr };
  }

  return { coverage: (100 * ink) / total, maxAlpha, levelAt: best.deg };
}

const { width: textWidth, height: textHeight } = await measureText();
console.log(`text "${TEXT}" renders ${textWidth}x${textHeight}px at ${FONT_SIZE}px bold`);

await sharp(buildSvg(textWidth)).png().toFile(OUT);
const stat = await fs.stat(OUT);

const made = await describe(OUT);
console.log(`\nwrote ${path.relative(ROOT, OUT)} (${(stat.size / 1024).toFixed(0)} KB)`);
console.log(`  ink coverage : ${made.coverage.toFixed(1)}%   (the previous watermark was 4.6%)`);
console.log(`  peak alpha   : ${made.maxAlpha}          (the previous watermark was 117)`);
console.log(`  levels at    : ${made.levelAt}°           (the previous watermark was 30°)`);
