import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

// The watermark is a pre-rendered PNG, not an SVG drawn per upload.
//
// It used to be an SVG composited at request time. That works in a plain Node
// script, but inside Next's server runtime libvips' SVG loader is unreliable:
// every composite failed with "Input buffer contains unsupported image format"
// in a production build, and in dev it worked until the first hot reload and
// then failed for the life of the process. Uploads failed 100% of the time
// once it tipped over.
//
// Resizing and compositing a PNG uses none of that machinery, so the upload
// path no longer depends on it. Regenerate the file with the snippet in
// ARCHITECTURE.md if the watermark styling ever changes.
const WATERMARK_PATH = path.join(process.cwd(), "public", "images", "watermark.png");

// Read once per process rather than per photo — a batch of 200 uploads would
// otherwise re-read the same 361KB file 400 times.
let watermarkPromise: Promise<Buffer> | null = null;
function watermark(): Promise<Buffer> {
  watermarkPromise ??= fs.readFile(WATERMARK_PATH);
  return watermarkPromise;
}

export type ProcessedRender = { buffer: Buffer; width: number; height: number };
export type ProcessedPhoto = { preview: ProcessedRender; thumb: ProcessedRender };

// Scaled to cover rather than stretched to fit, so the lettering keeps its
// shape on portrait and landscape alike.
async function watermarked(
  source: Buffer,
  width: number,
  quality: number
): Promise<ProcessedRender> {
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

// Resizes + watermarks one uploaded photo into preview and thumb renders.
export async function processUploadedPhoto(source: Buffer): Promise<ProcessedPhoto> {
  const srcMeta = await sharp(source).rotate().metadata();
  const isPortrait = (srcMeta.height ?? 0) > (srcMeta.width ?? 0);

  const preview = await watermarked(source, isPortrait ? 1100 : 1600, 80);
  const thumb = await watermarked(source, isPortrait ? 700 : 900, 76);

  return { preview, thumb };
}

// Turns "DSC_0142 finish line!.jpg" into "dsc-0142-finish-line", then makes
// it unique against whatever ids already exist.
export function slugifyFilename(filename: string, existingIds: Set<string>): string {
  const base =
    filename
      .replace(/\.[^./]+$/, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "photo";

  if (!existingIds.has(base)) return base;

  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
