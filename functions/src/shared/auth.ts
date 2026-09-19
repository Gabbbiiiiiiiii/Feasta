import type {
  CallableRequest,
} from "firebase-functions/v2/https";
import {HttpsError} from "firebase-functions/v2/https";
import {
  correlationIdFromCallable,
  logSecurityEvent,
} from "./security-events.js";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  correlationId: string;
}

export function requireAuth(
  request: CallableRequest,
): AuthenticatedUser {
  if (!request.auth) {
    logSecurityEvent({
      action: "account_access_denied",
      outcome: "denied",
      correlationId: correlationIdFromCallable(request),
      reasonCode: "authentication_required",
    });
    throw new HttpsError(
      "unauthenticated",
      "Authentication is required.",
    );
  }

  return {
    uid: request.auth.uid,
    correlationId: correlationIdFromCallable(request),
    email:
      typeof request.auth.token.email === "string"
        ? request.auth.token.email
        : undefined,
  };
}
