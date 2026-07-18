import {NextResponse} from "next/server";

import {
  createVerifiedSession,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";
import {assertTrustedMutation} from "@/lib/security/request";
import {
  logWebSecurityEvent,
  requestCorrelationId,
} from "@/lib/security/logging";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    assertTrustedMutation(request);
  } catch (error) {
    logWebSecurityEvent({
      action: "session_creation",
      outcome: "denied",
      reasonCode: "untrusted_origin_or_csrf",
      correlationId,
    });
    const message = error instanceof Error ? error.message : "Request denied.";
    return NextResponse.json({error: message}, {status: 403});
  }

  try {
    const body = await request.json() as {idToken?: unknown};
    if (typeof body.idToken !== "string" || body.idToken.length < 100) {
      logWebSecurityEvent({
        action: "session_creation",
        outcome: "denied",
        reasonCode: "missing_or_invalid_id_token",
        correlationId,
      });
      return NextResponse.json({error: "ID token is required."}, {status: 400});
    }

    const {cookie, user} = await createVerifiedSession(body.idToken);
    const response = NextResponse.json({role: user.role});
    response.cookies.set(SESSION_COOKIE_NAME, cookie, sessionCookieOptions);
    return response;
  } catch {
    logWebSecurityEvent({
      action: "session_creation",
      outcome: "denied",
      reasonCode: "token_or_account_rejected",
      correlationId,
    });
    return NextResponse.json(
      {error: "Sign-in could not be completed."},
      {status: 401},
    );
  }
}
