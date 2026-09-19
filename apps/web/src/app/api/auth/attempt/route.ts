import {NextResponse} from "next/server";
import {normalizePhilippineMobile} from "@feasta/shared-types";

import {adminAuth} from "@/lib/firebase/admin";
import {loadTrustedAccountContext} from "@/lib/auth/session";
import {
  logWebSecurityEvent,
  requestCorrelationId,
} from "@/lib/security/logging";
import {assertTrustedMutation} from "@/lib/security/request";
import {
  enforceWebAuthenticationActionRateLimit,
  SessionRateLimitError,
  WEB_AUTHENTICATION_ATTEMPT_ACTIONS,
  type WebAuthenticationAttemptAction,
} from "@/lib/security/session-rate-limit";

const publicActions = new Set<WebAuthenticationAttemptAction>([
  "customer_registration",
  "provider_registration",
  "provider_phone_registration",
  "password_reset",
]);

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    assertTrustedMutation(request);
  } catch {
    return denied(correlationId, "untrusted_origin_or_csrf", 403);
  }

  try {
    const body = await request.json() as {
      action?: unknown;
      identifier?: unknown;
      idToken?: unknown;
    };
    if (!isAuthenticationAttemptAction(body.action)) {
      return denied(correlationId, "invalid_action", 400);
    }

    const subject = publicActions.has(body.action)
      ? normalizePublicIdentifier(body.identifier, body.action)
      : await authenticatedSubject(body.idToken);
    await enforceWebAuthenticationActionRateLimit(
      request,
      body.action,
      subject,
    );
    logWebSecurityEvent({
      action: "authentication_attempt_preflight",
      outcome: "succeeded",
      targetId: body.action,
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
        action: "authentication_attempt_preflight",
        outcome: "denied",
        reasonCode: "rate_limited",
        correlationId,
      });
      return NextResponse.json(
        {error: "Too many requests. Please wait before trying again."},
        {
          status: 429,
          headers: {
            "Retry-After": String(error.retryAfterSeconds),
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (error instanceof PublicIdentifierError) {
      return denied(correlationId, "invalid_identifier", 400);
    }
    return denied(correlationId, "invalid_or_expired_authentication", 401);
  }
}

function isAuthenticationAttemptAction(
  value: unknown,
): value is WebAuthenticationAttemptAction {
  return typeof value === "string" &&
    (WEB_AUTHENTICATION_ATTEMPT_ACTIONS as readonly string[]).includes(value);
}

function normalizePublicIdentifier(
  value: unknown,
  action: WebAuthenticationAttemptAction,
): string {
  if (typeof value !== "string") throw new PublicIdentifierError();
  if (action === "provider_phone_registration") {
    const phoneNumber = normalizePhilippineMobile(value);
    if (!phoneNumber) throw new PublicIdentifierError();
    return `phone:${phoneNumber}`;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
  ) {
    throw new PublicIdentifierError();
  }
  return `email:${normalized}`;
}

class PublicIdentifierError extends Error {}

async function authenticatedSubject(idToken: unknown): Promise<string> {
  if (typeof idToken !== "string" || idToken.length < 100) {
    throw new Error("Authentication is required.");
  }
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  await loadTrustedAccountContext(decoded.uid);
  return `uid:${decoded.uid}`;
}

function denied(
  correlationId: string,
  reasonCode: string,
  status: number,
) {
  logWebSecurityEvent({
    action: "authentication_attempt_preflight",
    outcome: "denied",
    reasonCode,
    correlationId,
  });
  return NextResponse.json(
    {error: "The authentication request could not be completed."},
    {status, headers: {"Cache-Control": "no-store"}},
  );
}
