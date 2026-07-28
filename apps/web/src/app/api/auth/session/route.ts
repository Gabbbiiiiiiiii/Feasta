import {NextResponse} from "next/server";
import {USER_ROLES, type UserRole} from "@feasta/shared-types";

import {
  AccountAccessError,
  createSession,
  safeAccountReturnPath,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";
import {assertTrustedMutation} from "@/lib/security/request";
import {
  logWebSecurityEvent,
  requestCorrelationId,
} from "@/lib/security/logging";
import {
  enforceSessionCreationRateLimit,
  recordAdminLoginSuccess,
  SessionRateLimitError,
} from "@/lib/security/session-rate-limit";

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
    await enforceSessionCreationRateLimit(request);
    const body = await request.json() as {
      idToken?: unknown;
      returnTo?: unknown;
      expectedRole?: unknown;
    };
    if (typeof body.idToken !== "string" || body.idToken.length < 100) {
      logWebSecurityEvent({
        action: "session_creation",
        outcome: "denied",
        reasonCode: "missing_or_invalid_id_token",
        correlationId,
      });
      return NextResponse.json({error: "ID token is required."}, {status: 400});
    }

    const {cookie, account} = await createSession(body.idToken);
    if (
      body.expectedRole !== undefined &&
      (
        !isUserRole(body.expectedRole) ||
        account.role !== body.expectedRole
      )
    ) {
      logWebSecurityEvent({
        action: "session_creation",
        outcome: "denied",
        actorUid: account.uid,
        reasonCode: "unexpected_role",
        correlationId,
      });
      return NextResponse.json(
        {
          error: "This account cannot use the selected FEASTA portal.",
          reason: "unauthorized_role",
        },
        {status: 403},
      );
    }
    if (
      process.env.NODE_ENV === "production" &&
      account.role === "admin" &&
      account.email
    ) {
      try {
        await recordAdminLoginSuccess(
          request,
          account.email,
        );
      } catch (error) {
        console.error(
          "Unable to record admin login success:",
          error,
        );
      }
    }
    const response = NextResponse.json({
      role: account.role,
      destination: safeAccountReturnPath(body.returnTo, account),
    });
    response.cookies.set(SESSION_COOKIE_NAME, cookie, sessionCookieOptions);
    response.headers.set("Cache-Control", "no-store");
    logWebSecurityEvent({
      action: "session_creation",
      outcome: "succeeded",
      actorUid: account.uid,
      reasonCode: `${account.role}_session_created`,
      correlationId,
    });
    return response;
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
      logWebSecurityEvent({
        action: "session_creation",
        outcome: "denied",
        reasonCode: "rate_limited",
        correlationId,
      });
      return NextResponse.json(
        {error: "Too many sign-in attempts. Please wait and try again."},
        {
          status: 429,
          headers: {"Retry-After": String(error.retryAfterSeconds)},
        },
      );
    }
    if (error instanceof AccountAccessError) {
      const reason = safeAccountFailureReason(error.reason);
      logWebSecurityEvent({
        action: "session_creation",
        outcome: "denied",
        reasonCode: error.reason,
        correlationId,
      });
      return NextResponse.json(
        {
          error: "This account is not available for sign-in.",
          reason,
        },
        {status: 403},
      );
    }
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

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value);
}

function safeAccountFailureReason(
  reason: AccountAccessError["reason"],
): string {
  switch (reason) {
    case "blocked_account":
      return "account_blocked";

    case "deactivated_account":
    case "disabled_auth_account":
    case "inactive_account":
      return "account_disabled";

    case "missing_user_profile":
    case "missing_customer_profile":
      return "missing_profile";

    default:
      return "account_unavailable";
  }
}
