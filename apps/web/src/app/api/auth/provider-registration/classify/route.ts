import {NextResponse} from "next/server";

import {
  classifyAuthenticatedProviderPhone,
  verifyProviderPhoneClassificationToken,
} from "@/lib/auth/provider-registration-server";
import {
  logWebSecurityEvent,
  requestCorrelationId,
} from "@/lib/security/logging";
import {assertTrustedMutation} from "@/lib/security/request";
import {
  enforceWebAuthenticationActionRateLimit,
  SessionRateLimitError,
} from "@/lib/security/session-rate-limit";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    assertTrustedMutation(request);
  } catch {
    return denied(correlationId, "untrusted_origin_or_csrf", 403);
  }

  try {
    const body = await request.json() as {
      idToken?: unknown;
      phoneNumber?: unknown;
    };
    if (
      typeof body.idToken !== "string" ||
      body.idToken.length < 100 ||
      typeof body.phoneNumber !== "string"
    ) {
      return denied(correlationId, "invalid_request", 400);
    }
    const {decoded, authUser} = await verifyProviderPhoneClassificationToken(
      body.idToken,
    );
    await enforceWebAuthenticationActionRateLimit(
      request,
      "provider_phone_classification",
      `uid:${decoded.uid}`,
    );
    const result = await classifyAuthenticatedProviderPhone({
      decoded,
      authUser,
      submittedPhoneNumber: body.phoneNumber,
    });
    logWebSecurityEvent({
      action: "provider_phone_registration_classified",
      outcome: result.classification === "non_provider_account" ||
        result.classification === "malformed_provider_relationship"
        ? "denied"
        : "succeeded",
      actorUid: decoded.uid,
      reasonCode: result.classification,
      correlationId,
    });
    return NextResponse.json(result, {
      status: 200,
      headers: {"Cache-Control": "no-store"},
    });
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
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
    return denied(correlationId, "invalid_phone_authentication", 401);
  }
}

function denied(correlationId: string, reasonCode: string, status: number) {
  logWebSecurityEvent({
    action: "provider_phone_registration_classified",
    outcome: "denied",
    reasonCode,
    correlationId,
  });
  return NextResponse.json(
    {error: "The provider registration request could not be completed."},
    {status, headers: {"Cache-Control": "no-store"}},
  );
}
