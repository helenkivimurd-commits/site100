import sharp from "sharp";

// Mirrors the watermark styling in scripts/process-photos.mjs — keep both in
// sync if the look changes (the script exists for reprocessing everything at
// once; this runs per-upload from the admin page).
function watermarkSvg(width: number, height: number): Buffer {
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

export type ProcessedRender = { buffer: Buffer; width: number; height: number };
export type ProcessedPhoto = { preview: ProcessedRender; thumb: ProcessedRender };

// Resizes + watermarks one uploaded photo into preview and thumb renders,
// matching what scripts/process-photos.mjs produces for the bulk library.
export async function processUploadedPhoto(source: Buffer): Promise<ProcessedPhoto> {
  const srcMeta = await sharp(source).rotate().metadata();
  const isPortrait = (srcMeta.height ?? 0) > (srcMeta.width ?? 0);

  const previewWidth = isPortrait ? 1100 : 1600;
  const previewBase = await sharp(source)
    .rotate()
    .resize({ width: previewWidth, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const previewSvg = watermarkSvg(previewBase.info.width, previewBase.info.height);
  const previewBuffer = await sharp(previewBase.data)
    .composite([{ input: previewSvg }])
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  const thumbWidth = isPortrait ? 700 : 900;
  const thumbBase = await sharp(source)
    .rotate()
    .resize({ width: thumbWidth, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const thumbSvg = watermarkSvg(thumbBase.info.width, thumbBase.info.height);
  const thumbBuffer = await sharp(thumbBase.data)
    .composite([{ input: thumbSvg }])
    .jpeg({ quality: 76, mozjpeg: true })
    .toBuffer();

  return {
    preview: { buffer: previewBuffer, width: previewBase.info.width, height: previewBase.info.height },
    thumb: { buffer: thumbBuffer, width: thumbBase.info.width, height: thumbBase.info.height },
  };
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
