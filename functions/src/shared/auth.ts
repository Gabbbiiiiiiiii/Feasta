import type {
  CallableRequest,
} from "firebase-functions/v2/https";
import {HttpsError} from "firebase-functions/v2/https";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
}

export function requireAuth(
  request: CallableRequest,
): AuthenticatedUser {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication is required.",
    );
  }

  return {
    uid: request.auth.uid,
    email:
      typeof request.auth.token.email === "string"
        ? request.auth.token.email
        : undefined,
  };
}