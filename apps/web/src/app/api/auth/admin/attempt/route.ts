import {NextResponse} from "next/server";

import {
  logWebSecurityEvent,
  requestCorrelationId,
} from "@/lib/security/logging";
import {assertTrustedMutation} from "@/lib/security/request";
import {
  enforceAdminLoginAttemptRateLimit,
  SessionRateLimitError,
} from "@/lib/security/session-rate-limit";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    assertTrustedMutation(request);
  } catch {
    logWebSecurityEvent({
      action: "admin_login_attempt",
      outcome: "denied",
      reasonCode: "untrusted_origin_or_csrf",
      correlationId,
    });
    return NextResponse.json(
      {error: "Sign-in could not be completed."},
      {status: 403},
    );
  }

  try {
    const body = await request.json() as {email?: unknown};
    if (
      typeof body.email !== "string" ||
      body.email.trim().length < 3 ||
      body.email.length > 320
    ) {
      return NextResponse.json(
        {error: "Sign-in could not be completed."},
        {status: 400},
      );
    }
    if (process.env.NODE_ENV === "production") {
      await enforceAdminLoginAttemptRateLimit(request, body.email);
    }
    logWebSecurityEvent({
      action: "admin_login_attempt",
      outcome: "succeeded",
      reasonCode: "attempt_allowed",
      correlationId,
    });
    return new NextResponse(null, {
      status: 204,
      headers: {"Cache-Control": "no-store"},
    });
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
      logWebSecurityEvent({
        action: "admin_login_attempt",
        outcome: "denied",
        reasonCode: "rate_limited",
        correlationId,
      });
      return NextResponse.json(
        {
          error: "Sign-in could not be completed. Please wait and try again.",
          reason: "rate_limited",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(error.retryAfterSeconds),
            "Cache-Control": "no-store",
          },
        },
      );
    }

    console.error("Admin login rate-limit failure:", {
      correlationId,
      error,
    });
  
    logWebSecurityEvent({
      action: "admin_login_attempt",
      outcome: "failed",
      reasonCode: "rate_limit_unavailable",
      correlationId,
    });
    return NextResponse.json(
      {
        error: "Admin login rate limiting is unavailable.",
        reason: "rate_limit_unavailable",
      },
      {
        status: 503,
        headers: {"Cache-Control": "no-store"},
      },
    );
  }
}
