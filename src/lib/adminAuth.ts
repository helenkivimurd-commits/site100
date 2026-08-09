import { NextResponse } from "next/server";

// The password check behind /admin and the photo APIs. Two things can prove you
// are the photographer:
//
//   1. An `Authorization: Basic` header — this is what the browser's own login
//      box sends, so no login page is needed. Leave the username blank.
//   2. A signed `admin_session` cookie, minted the first time Basic auth
//      succeeds so later requests don't depend on the header being resent.
//
// Both are checked here rather than in one place only, because src/proxy.ts and
// the route handlers themselves both call in — see guardAdminRoute below.

export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

// Bumped if the token layout ever changes, so old cookies stop verifying
// instead of being reinterpreted.
const TOKEN_VERSION = "v1";

// Fixed salt: it only has to separate this key from any other use of the same
// password, and it must be stable across restarts or every session would break.
const KEY_SALT = "h_kivimurd/admin-session/v1";
const KEY_ITERATIONS = 100_000;

// The value shipped in .env.local.example. Anyone can read it, so treat a
// .env.local that still has it as no password at all.
const PLACEHOLDER = "replace_me_with_a_long_random_password";

const encoder = new TextEncoder();

function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD;
  if (!value || value === PLACEHOLDER) return null;
  return value;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Both arguments are always hex digests of the same length here, so the early
// length check can't leak anything about the password itself.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

// Stretching the password before using it as a signing key means a stolen
// cookie can't be ground back into the password offline. Deriving costs ~100ms,
// so the result is cached for the life of the process.
let cachedKey: { password: string; key: Promise<CryptoKey> } | null = null;

function signingKey(password: string): Promise<CryptoKey> {
  if (cachedKey?.password === password) return cachedKey.key;

  const key = (async () => {
    const material = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode(KEY_SALT),
        iterations: KEY_ITERATIONS,
        hash: "SHA-256",
      },
      material,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  })();

  // Don't leave a rejected promise cached — the next request should retry.
  key.catch(() => {
    if (cachedKey?.key === key) cachedKey = null;
  });

  cachedKey = { password, key };
  return key;
}

async function sign(password: string, message: string): Promise<string> {
  const key = await signingKey(password);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

async function createSessionToken(password: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const signature = await sign(password, `${TOKEN_VERSION}.${expiresAt}`);
  return `${expiresAt}.${signature}`;
}

async function isValidSessionToken(token: string, password: string): Promise<boolean> {
  const separator = token.indexOf(".");
  if (separator === -1) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expected = await sign(password, `${TOKEN_VERSION}.${expiresAt}`);
  if (!constantTimeEqual(signature, expected)) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return null;
}

// `Basic <base64>` decodes to "username:password". The username is ignored —
// there is only one account — and everything after the first colon is the
// password, so colons in the password survive the round trip.
function passwordFromBasicAuth(header: string | null): string | null {
  if (!header) return null;

  const separator = header.indexOf(" ");
  if (separator === -1) return null;
  if (header.slice(0, separator).toLowerCase() !== "basic") return null;

  let decoded: string;
  try {
    const bytes = Uint8Array.from(atob(header.slice(separator + 1).trim()), (c) =>
      c.charCodeAt(0)
    );
    decoded = new TextDecoder().decode(bytes);
  } catch {
    return null;
  }

  const colon = decoded.indexOf(":");
  return colon === -1 ? null : decoded.slice(colon + 1);
}

export type AdminAccess =
  // `session` is a freshly minted cookie value when the request authenticated
  // over Basic auth and should be given a session; null when it already had one.
  | { status: "ok"; session: string | null }
  | { status: "not-configured" }
  | { status: "unauthorized" };

export async function checkAdminAccess(request: Request): Promise<AdminAccess> {
  const password = adminPassword();
  // Fail closed. A missing password must lock the admin area, not open it.
  if (!password) return { status: "not-configured" };

  const token = readCookie(request, SESSION_COOKIE);
  if (token && (await isValidSessionToken(token, password))) {
    return { status: "ok", session: null };
  }

  const supplied = passwordFromBasicAuth(request.headers.get("authorization"));
  if (supplied !== null) {
    // Compare digests rather than the raw strings so the check doesn't take
    // longer the more leading characters a guess gets right.
    const [a, b] = await Promise.all([sha256Hex(supplied), sha256Hex(password)]);
    if (constantTimeEqual(a, b)) {
      return { status: "ok", session: await createSessionToken(password) };
    }
  }

  return { status: "unauthorized" };
}

// The `WWW-Authenticate` header is what makes the browser show its own login
// box, which is why there's no login page in this app.
export function adminChallengeResponse(): NextResponse {
  return NextResponse.json(
    { error: "Authentication required." },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Admin", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    }
  );
}

export function adminNotConfiguredResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "The admin area is locked because ADMIN_PASSWORD is not set. Add it to .env.local and restart the server.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

// Belt and braces for the routes that hand out files: src/proxy.ts already
// blocks these paths, so this only matters if its matcher is ever changed or a
// route moves out from under it. Returns null when the request may proceed.
export async function guardAdminRoute(request: Request): Promise<NextResponse | null> {
  const access = await checkAdminAccess(request);
  if (access.status === "not-configured") return adminNotConfiguredResponse();
  if (access.status === "unauthorized") return adminChallengeResponse();
  return null;
}
