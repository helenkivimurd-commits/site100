import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Orders live in a JSON file like the photo catalog does. That's fine on a
// server with a real disk; on a read-only serverless host (Vercel) this needs
// to become a database before going live.
//
// Deliberately outside src/ — this file is written on every purchase, and
// runtime writes inside the source tree can make the dev server rebuild.
const DATA_FILE = path.join(process.cwd(), ".data", "orders.json");

const DOWNLOAD_DAYS = 30;

export type Order = {
  sessionId: string;
  token: string;
  email: string | null;
  photoIds: string[];
  // Cents, as Stripe counts them — avoids float drift on discounted prices.
  amountTotal: number;
  status: "pending" | "paid";
  createdAt: string;
  expiresAt: string;
  emailSentAt?: string;
};

// Same read-modify-write guard as the photos API: concurrent webhook retries
// and checkout requests must not interleave and clobber the file.
let writeQueue: Promise<unknown> = Promise.resolve();

function withQueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function readData(): Promise<Record<string, Order>> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
  } catch {
    // First order ever, or the file was cleared — start empty.
    return {};
  }
}

async function writeData(data: Record<string, Order>) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
}

// URL-safe and long enough that guessing one is not worth anyone's time.
function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

// Written before the customer is sent to Stripe, so the photo list is fixed
// server-side and can't be swapped afterwards. The webhook only flips status.
export async function createPendingOrder(
  sessionId: string,
  photoIds: string[],
  amountTotal: number,
  email: string | null
): Promise<Order> {
  return withQueue(async () => {
    const data = await readData();
    const now = new Date();
    const order: Order = {
      sessionId,
      token: newToken(),
      email,
      photoIds,
      amountTotal,
      status: "pending",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DOWNLOAD_DAYS * 86400_000).toISOString(),
    };
    data[sessionId] = order;
    await writeData(data);
    return order;
  });
}

export async function getOrderBySession(sessionId: string): Promise<Order | null> {
  const data = await readData();
  return data[sessionId] ?? null;
}

export async function getOrderByToken(token: string): Promise<Order | null> {
  const data = await readData();
  return Object.values(data).find((o) => o.token === token) ?? null;
}

// Idempotent: Stripe retries webhooks, and marking an already-paid order paid
// again must not resend the email or change the token.
export async function markPaid(sessionId: string): Promise<{ order: Order | null; alreadyPaid: boolean }> {
  return withQueue(async () => {
    const data = await readData();
    const order = data[sessionId];
    if (!order) return { order: null, alreadyPaid: false };
    if (order.status === "paid") return { order, alreadyPaid: true };

    order.status = "paid";
    data[sessionId] = order;
    await writeData(data);
    return { order, alreadyPaid: false };
  });
}

export async function recordEmailSent(sessionId: string): Promise<void> {
  await withQueue(async () => {
    const data = await readData();
    if (!data[sessionId]) return;
    data[sessionId].emailSentAt = new Date().toISOString();
    await writeData(data);
  });
}

export function isExpired(order: Order): boolean {
  return new Date(order.expiresAt).getTime() < Date.now();
}

export function downloadUrl(baseUrl: string, token: string, photoId: string): string {
  return `${baseUrl}/api/download?token=${encodeURIComponent(token)}&photo=${encodeURIComponent(photoId)}`;
}
