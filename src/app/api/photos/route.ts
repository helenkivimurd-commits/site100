import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StoredPhoto } from "@/lib/types";
import { processUploadedPhoto, slugifyFilename } from "@/lib/serverImage";
import { putOriginal } from "@/lib/originals";
import { guardAdminRoute } from "@/lib/adminAuth";

const DATA_FILE = path.join(process.cwd(), "src", "data", "photos.json");
// Only ever written to at runtime, never read at build time. Because these
// resolve statically to a subfolder, output file tracing pulls both folders
// wholesale into this route's .nft.json (~6.4 MB of JPEGs the server never
// needs); `outputFileTracingExcludes` in next.config.ts keeps them out. POST
// mkdir -p's both before writing, so an empty public/ on the server is fine.
const PREVIEW_DIR = path.join(process.cwd(), "public", "photos", "preview");
const THUMB_DIR = path.join(process.cwd(), "public", "photos", "thumb");

// Generous for a camera JPEG, small enough that a handful in flight can't
// exhaust memory — each upload is buffered whole before sharp sees it.
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic"]);

function extensionOf(filename: string): string {
  return path.extname(filename).toLowerCase();
}

// Every write below goes through this queue so concurrent requests (e.g.
// uploading several photos, or editing two rows at once) can't interleave
// their read-modify-write cycles and corrupt photos.json.
let writeQueue: Promise<unknown> = Promise.resolve();

function withQueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function readData(): Promise<Record<string, StoredPhoto>> {
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

async function writeData(data: Record<string, StoredPhoto>) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
}

// Every handler in this file is admin-only. src/proxy.ts already turns away
// unauthenticated requests to /api/photos; guardAdminRoute repeats the check
// here so these handlers stay closed if that matcher is ever narrowed.

// The admin page reads the library through this rather than importing
// src/data/photos.json. That keeps the file out of the admin route's module
// graph, so saving an edit doesn't make the dev server rebuild and reload the
// page out from under you mid-tagging.
export async function GET(request: Request) {
  const denied = await guardAdminRoute(request);
  if (denied) return denied;

  const data = await readData();
  const photos = Object.entries(data).map(([id, meta]) => ({ id, ...meta }));
  return NextResponse.json(
    { photos },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const denied = await guardAdminRoute(request);
  if (denied) return denied;

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const day = String(form.get("day") ?? "").trim();
  const discipline = String(form.get("discipline") ?? "").trim();
  const event = String(form.get("event") ?? "").trim();

  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }
  if (!day || !discipline || !event) {
    return NextResponse.json({ error: "day, discipline and event are required" }, { status: 400 });
  }

  // Each file is read fully into memory below, so an unbounded upload is an
  // out-of-memory crash waiting to happen. Checked before any bytes are read.
  const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES);
  if (tooBig) {
    return NextResponse.json(
      {
        error: `"${tooBig.name}" is ${Math.round(tooBig.size / 1024 / 1024)} MB — the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB per photo.`,
      },
      { status: 413 }
    );
  }

  const wrongType = files.find((f) => !ALLOWED_EXTENSIONS.has(extensionOf(f.name)));
  if (wrongType) {
    return NextResponse.json(
      { error: `"${wrongType.name}" isn't an image we can process.` },
      { status: 415 }
    );
  }

  const created = await withQueue(async () => {
    await fs.mkdir(PREVIEW_DIR, { recursive: true });
    await fs.mkdir(THUMB_DIR, { recursive: true });

    const data = await readData();
    const existingIds = new Set(Object.keys(data));
    const entries: (StoredPhoto & { id: string })[] = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const source = Buffer.from(arrayBuffer);
      const id = slugifyFilename(file.name, existingIds);
      existingIds.add(id);

      const processed = await processUploadedPhoto(source);
      await fs.writeFile(path.join(PREVIEW_DIR, `${id}.jpg`), processed.preview.buffer);
      await fs.writeFile(path.join(THUMB_DIR, `${id}.jpg`), processed.thumb.buffer);
      // Keep the original for future reprocessing (e.g. a bigger watermark, a new hero crop)
      // and for the paid download. It goes to object storage, never to this
      // server's disk and never under public/.
      //
      // Keyed on `id`, never on file.name: the browser controls that string, and
      // `id` is already reduced to [a-z0-9-]. Naming the object after it is also
      // what guarantees findOriginal() can match it back to this photo.
      await putOriginal(id, extensionOf(file.name), source);

      const entry: StoredPhoto = {
        title: file.name.replace(/\.[^./]+$/, ""),
        event,
        day,
        discipline: discipline as StoredPhoto["discipline"],
        width: processed.preview.width,
        height: processed.preview.height,
        thumbWidth: processed.thumb.width,
        thumbHeight: processed.thumb.height,
        bibs: [],
        reviewed: false,
      };
      data[id] = entry;
      entries.push({ id, ...entry });
    }

    await writeData(data);
    return entries;
  });

  return NextResponse.json({ ok: true, created });
}

export async function PATCH(request: Request) {
  const denied = await guardAdminRoute(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    id?: string;
    title?: string;
    day?: string;
    discipline?: string;
    event?: string;
    bibs?: string[];
    reviewed?: boolean;
  };
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updated = await withQueue(async () => {
    const data = await readData();
    const existing = data[id];
    if (!existing) return null;

    data[id] = {
      ...existing,
      ...(body.title !== undefined && { title: body.title }),
      ...(body.day !== undefined && { day: body.day }),
      ...(body.discipline !== undefined && {
        discipline: body.discipline as StoredPhoto["discipline"],
      }),
      ...(body.event !== undefined && { event: body.event }),
      ...(body.bibs !== undefined && {
        bibs: body.bibs.map((b) => b.trim()).filter(Boolean),
      }),
      ...(body.reviewed !== undefined && { reviewed: body.reviewed }),
    };

    await writeData(data);
    return data[id];
  });

  if (!updated) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return NextResponse.json({ ok: true, photo: { id, ...updated } });
}

export async function DELETE(request: Request) {
  const denied = await guardAdminRoute(request);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const found = await withQueue(async () => {
    const data = await readData();
    if (!data[id]) return false;
    delete data[id];
    await writeData(data);
    return true;
  });

  if (!found) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  await Promise.all([
    fs.rm(path.join(PREVIEW_DIR, `${id}.jpg`), { force: true }),
    fs.rm(path.join(THUMB_DIR, `${id}.jpg`), { force: true }),
  ]);

  return NextResponse.json({ ok: true });
}
