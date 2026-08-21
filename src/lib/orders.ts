import crypto from "node:crypto";
import { ORDERS_FILE, readJsonFile, writeJsonFileAtomic } from "./storage";

// Orders live in a JSON file like the photo catalog does. That's fine on a
// server with a real disk; on a read-only serverless host (Vercel) this needs
// to become a database before going live.
//
// Deliberately outside src/ — this file is written on every purchase, and
// runtime writes inside the source tree can make the dev server rebuild.
// Location, atomic write and corrupt-file handling all live in storage.ts.
const DATA_FILE = ORDERS_FILE;

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

// No file yet means no orders yet. A file that exists but will not parse throws
// instead of reading as empty — returning {} there would let the next order
// overwrite every paid order already recorded.
async function readData(): Promise<Record<string, Order>> {
  return readJsonFile<Record<string, Order>>(DATA_FILE, {});
}

// Atomic. This file holds what customers paid for and the tokens that let them
// download it, and it is rewritten in full on every order and every webhook.
async function writeData(data: Record<string, Order>) {
  await writeJsonFileAtomic(DATA_FILE, data);
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
