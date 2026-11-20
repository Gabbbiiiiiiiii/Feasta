import {NextResponse} from "next/server";

import {adminAuth} from "@/lib/firebase/admin";
import {
  destroySession,
  isInvalidSessionError,
  SESSION_COOKIE_NAME,
  verifySessionCookie,
} from "@/lib/auth/session";
import {assertTrustedMutation} from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request denied.";
    return NextResponse.json({error: message}, {status: 403});
  }

  const value = request.headers.get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (value) {
    try {
      let decodedValue: string;
      try { decodedValue = decodeURIComponent(value); }
      catch { decodedValue = value; }
      const user = await verifySessionCookie(decodedValue);
      await adminAuth.revokeRefreshTokens(user.uid);
    } catch (error) {
      if (!isInvalidSessionError(error)) {
        return NextResponse.json(
          {error: "Sign out could not be completed. Please try again."},
          {status: 503, headers: {"Cache-Control": "no-store", "Retry-After": "5"}},
        );
      }
    }
  }

  const response = NextResponse.json({success: true});
  destroySession(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
