import {NextResponse} from "next/server";
import type {UserRole} from "@feasta/shared-types";

import {adminAuth, adminDb} from "@/lib/firebase/admin";
import {
  logWebSecurityEvent,
  requestCorrelationId,
} from "@/lib/security/logging";
import {assertTrustedMutation} from "@/lib/security/request";
import {
  enforceWebAuthenticationActionRateLimit,
  SessionRateLimitError,
} from "@/lib/security/session-rate-limit";

type PasswordResetRole = Extract<UserRole, "customer" | "provider">;

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);

  try {
    assertTrustedMutation(request);
  } catch {
    return genericResponse();
  }

  let body: {
    email?: unknown;
    expectedRole?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return genericResponse();
  }

  const email = normalizeEmail(body.email);
  const expectedRole = parsePasswordResetRole(body.expectedRole);

  if (!email || !expectedRole) {
    return genericResponse();
  }

  try {
    await enforceWebAuthenticationActionRateLimit(
      request,
      "password_reset",
      `email:${email}`,
    );
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
      return NextResponse.json(
        {
          accepted: true,
          message:
            "If an eligible account matches that email, reset instructions are on the way.",
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

    return genericResponse();
  }

  try {
    const authUser = await adminAuth.getUserByEmail(email);

    const userSnapshot = await adminDb
      .collection("users")
      .doc(authUser.uid)
      .get();

    if (!userSnapshot.exists) {
      return genericResponse();
    }

    const profile = userSnapshot.data();
    const actualRole = profile?.role;

    if (actualRole !== expectedRole) {
      logWebSecurityEvent({
        action: "password_reset_role_mismatch",
        outcome: "denied",
        actorUid: authUser.uid,
        targetId: authUser.uid,
        reasonCode: "role_not_allowed",
        correlationId,
      });

      return genericResponse();
    }

    if (
      authUser.disabled ||
      profile?.accountStatus !== "active" ||
      profile?.isActive !== true ||
      profile?.isBlocked !== false
    ) {
      return genericResponse();
    }

    /*
     * The account is eligible for this reset surface.
     *
     * The actual reset email is still sent by Firebase Authentication
     * from the browser after this endpoint returns eligible=true.
     */
    return NextResponse.json(
      {accepted: true, eligible: true},
      {
        status: 200,
        headers: {"Cache-Control": "no-store"},
      },
    );
  } catch {
    /*
     * Do not reveal whether an email address exists.
     */
    return genericResponse();
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();

  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function parsePasswordResetRole(
  value: unknown,
): PasswordResetRole | null {
  return value === "customer" || value === "provider"
    ? value
    : null;
}

function genericResponse() {
  return NextResponse.json(
    {accepted: true, eligible: false},
    {
      status: 200,
      headers: {"Cache-Control": "no-store"},
    },
  );
}
