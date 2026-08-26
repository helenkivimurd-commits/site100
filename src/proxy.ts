import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  adminChallengeResponse,
  adminNotConfiguredResponse,
  checkAdminAccess,
} from "@/lib/adminAuth";
import { clientKey, rateLimit, resetRateLimit } from "@/lib/rateLimit";

// Only wrong passwords are counted, so the photographer's own browsing is never
// throttled however many requests the admin page makes. Ten guesses per quarter
// hour leaves a typo harmless while making an online brute force pointless.
const MAX_FAILED_LOGINS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// Runs before every request to the admin area. `proxy` is Next 16's name for
// what used to be called middleware; the old `middleware.ts` filename still
// works but warns that it is deprecated.
//
// Deliberately NOT matched: /api/download, which paying customers hit without
// ever logging in. It has its own gate — a one-time token tied to a paid order.
export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/photos",
    "/api/photos/:path*",
    // Mints download links to original files. Guarded here as well as in the
    // route itself.
    "/api/share",
  ],
};

export async function proxy(request: NextRequest) {
  const access = await checkAdminAccess(request);

  if (access.status === "not-configured") return adminNotConfiguredResponse();

  const limitKey = clientKey(request, "admin-login");

  if (access.status === "unauthorized") {
    const limit = rateLimit(limitKey, MAX_FAILED_LOGINS, LOGIN_WINDOW_MS);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many failed sign-in attempts. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" },
        }
      );
    }
    // Challenge only after the counter has been incremented, so a client that
    // ignores the 401 and keeps retrying still runs into the limit.
    return adminChallengeResponse();
  }

  // Correct password — forgive earlier typos rather than letting them
  // accumulate toward a lockout across the window.
  resetRateLimit(limitKey);

  const response = NextResponse.next();

  // Signed in over Basic auth just now — swap it for a session cookie so the
  // page's own fetch() calls carry proof without relying on the browser
  // resending the header. Once this expires the browser's cached Basic
  // credentials quietly mint a new one.
  if (access.session) {
    response.cookies.set({
      name: SESSION_COOKIE,
      value: access.session,
      httpOnly: true,
      sameSite: "lax",
      // Basic auth and this cookie are both replayable if read off the wire,
      // so in production they must only travel over HTTPS.
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }

  return response;
}
