import {NextResponse} from "next/server";

import {adminAuth} from "@/lib/firebase/admin";
import {
  destroySession,
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
      const user = await verifySessionCookie(decodeURIComponent(value));
      await adminAuth.revokeRefreshTokens(user.uid);
    } catch {
      // Expired/revoked cookies are cleared just like valid cookies.
    }
  }

  const response = NextResponse.json({success: true});
  destroySession(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
