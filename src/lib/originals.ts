import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Originals live in object storage (Backblaze B2), never on the app server's
// disk and never under public/ — the only ways out are the admin viewer
// (downscaled) and a paid download, both of which check access first.
//
// B2 speaks the S3 protocol, so this is the standard AWS client pointed at a
// B2 endpoint. Nothing here is AWS-specific; swapping to R2 or S3 proper is a
// change of the four env vars below.
const KEY_PREFIX = "originals/";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
};

export function contentTypeFor(extension: string): string {
  return CONTENT_TYPES[extension.toLowerCase()] ?? "application/octet-stream";
}

// How long a paid download link stays valid. Long enough to finish a 60 MB
// file on a slow connection, short enough that a link pasted into a group chat
// stops working before it spreads.
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

// Same lazy-singleton shape as lib/stripe.ts: nothing is read from the
// environment until the first call, so the app still boots (and every page
// that doesn't touch originals still works) when storage isn't configured yet.
let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;

  const endpoint = process.env.B2_ENDPOINT;
  const region = process.env.B2_REGION;
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APP_KEY;

  if (!endpoint || !region || !keyId || !appKey) {
    throw new Error(
      "Object storage is not configured. Set B2_ENDPOINT, B2_REGION, B2_KEY_ID and " +
        "B2_APP_KEY in .env.local — see .env.local.example."
    );
  }

  client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: appKey },
  });
  return client;
}

function getBucket(): string {
  const bucket = process.env.B2_BUCKET;
  if (!bucket) {
    throw new Error("B2_BUCKET is not set. See .env.local.example.");
  }
  return bucket;
}

/**
 * Resolves a photo id to its stored object key, or null if there's no original.
 *
 * Uploads name the object after the photo id (see the POST handler in
 * app/api/photos/route.ts), but the extension varies — .jpg, .heic, .tif — so
 * this looks the id up by prefix rather than guessing.
 *
 * Only ever returns a key the bucket itself listed back, so a crafted `id`
 * can't be turned into a read of some other object. Object keys are flat, so
 * there is no path traversal to defend against either.
 */
export async function findOriginal(id: string): Promise<string | null> {
  const response = await getClient().send(
    new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: `${KEY_PREFIX}${id}.`,
      MaxKeys: 1,
    })
  );

  return response.Contents?.[0]?.Key ?? null;
}

/**
 * A temporary, direct link to the original. The customer's browser fetches the
 * file from B2 rather than through this server, so a €4 VPS never has to push
 * 60 MB of JPEG. The link carries its own expiry and stops working after
 * DOWNLOAD_URL_TTL_SECONDS.
 *
 * `downloadName` is what the file is called once saved; it's sent as a response
 * header override rather than baked into the key, so the stored object keeps
 * its id-based name.
 */
export async function originalDownloadUrl(key: string, downloadName: string): Promise<string> {
  // Both headers are overridden per-request rather than trusted from the stored
  // object, so a file put there by rclone during the migration — which sets no
  // content type — still downloads correctly named and typed.
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${downloadName}"`,
      ResponseContentType: contentTypeFor(key.slice(key.lastIndexOf("."))),
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS }
  );
}

/** The raw bytes, for the admin viewer's downscale. Buffered because sharp needs them whole. */
export async function readOriginal(key: string): Promise<Buffer> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key })
  );
  if (!response.Body) throw new Error(`Object ${key} came back with no body.`);
  return Buffer.from(await response.Body.transformToByteArray());
}

/**
 * Stores an upload's original. `id` is already reduced to [a-z0-9-] by
 * slugifyFilename, and naming the object after it is what lets findOriginal()
 * match it back to this photo later.
 */
export async function putOriginal(id: string, extension: string, body: Buffer): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: `${KEY_PREFIX}${id}${extension}`,
      Body: body,
      ContentType: contentTypeFor(extension),
    })
  );
}
