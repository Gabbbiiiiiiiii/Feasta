import {NextResponse} from "next/server";

import {
  destroySession,
  homeForAccount,
  SESSION_COOKIE_NAME,
  verifySessionCookie,
} from "@/lib/auth/session";
import {isSafeRelativeReturnTo, parseCookie} from "@/lib/security/policy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedReturn = url.searchParams.get("returnTo");
  const returnTo = isSafeRelativeReturnTo(requestedReturn)
    ? requestedReturn
    : "/login";
  const cookie = parseCookie(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME,
  );

  if (cookie) {
    try {
      const account = await verifySessionCookie(cookie);
      return NextResponse.redirect(new URL(homeForAccount(account), url.origin));
    } catch {
      // Only invalid, expired, revoked, or disabled sessions are cleared here.
    }
  }

  const loginPath = returnTo === "/provider" ||
    returnTo.startsWith("/provider/")
    ? "/provider-login"
    : returnTo === "/admin" || returnTo.startsWith("/admin/")
      ? "/admin-login"
      : "/login";
  const loginUrl = new URL(loginPath, url.origin);
  loginUrl.searchParams.set("reason", "session-expired");
  if (returnTo !== "/login") loginUrl.searchParams.set("next", returnTo);
  const response = NextResponse.redirect(loginUrl);
  destroySession(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
