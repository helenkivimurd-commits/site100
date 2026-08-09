import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  adminChallengeResponse,
  adminNotConfiguredResponse,
  checkAdminAccess,
} from "@/lib/adminAuth";

// Runs before every request to the admin area. `proxy` is Next 16's name for
// what used to be called middleware; the old `middleware.ts` filename still
// works but warns that it is deprecated.
//
// Deliberately NOT matched: /api/download, which paying customers hit without
// ever logging in. It has its own gate — a one-time token tied to a paid order.
export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/photos", "/api/photos/:path*"],
};

export async function proxy(request: NextRequest) {
  const access = await checkAdminAccess(request);

  if (access.status === "not-configured") return adminNotConfiguredResponse();
  if (access.status === "unauthorized") return adminChallengeResponse();

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
