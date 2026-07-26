import {authenticationGatePresentation} from "@feasta/shared-types";

export function customerAuthenticationError(error: unknown): string {
  const reason = typeof error === "object" && error !== null && "reason" in error
    ? String(error.reason)
    : "";
  if (reason === "wrong_role") {
    return authenticationGatePresentation("forbiddenRole").message;
  }
  if (reason === "session_expired") {
    return authenticationGatePresentation("sessionExpired").message;
  }
  if (reason === "rate_limited") {
    return "Too many requests. Please wait before trying again.";
  }
  if (reason === "validation" && error instanceof Error) {
    return error.message;
  }
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

  if (code.includes("email-already-in-use")) {
    return "An account already uses this email. Sign in or reset your password.";
  }
  if (code.includes("weak-password")) {
    return "Choose a stronger password with at least 8 characters.";
  }
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("too-many-requests")) {
    return "Too many attempts. Please wait before trying again.";
  }
  if (code.includes("network-request-failed")) {
    return "Check your internet connection and try again.";
  }
  if (code.includes("expired-action-code")) {
    return "This link has expired. Request a new email.";
  }
  if (code.includes("invalid-action-code")) {
    return "This link is invalid or has already been used.";
  }
  if (code.includes("user-disabled")) {
    return authenticationGatePresentation("disabledAuthAccount").message;
  }
  return "We could not complete that request. Please try again.";
}
