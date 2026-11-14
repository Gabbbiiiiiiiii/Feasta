import {NextResponse} from "next/server";

import {
  destroySession,
  homeForAccount,
  safeAccountReturnPath,
  isInvalidSessionError,
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
      return NextResponse.redirect(new URL(
        returnTo === "/login" ? homeForAccount(account) : safeAccountReturnPath(returnTo, account),
        url.origin,
      ));
    } catch (error) {
      if (!isInvalidSessionError(error)) {
        return NextResponse.json(
          {error: "Session verification is temporarily unavailable. Please reload to try again."},
          {status: 503, headers: {"Cache-Control": "no-store", "Retry-After": "5"}},
        );
      }
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
