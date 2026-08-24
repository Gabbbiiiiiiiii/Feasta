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
  if (code.includes("missing-phone-number")) {
    return "Enter a valid Philippine mobile number.";
  }

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

export function providerPhoneVerificationError(error: unknown): string {
  const reason = typeof error === "object" && error !== null && "reason" in error
    ? String(error.reason)
    : "";
  if (reason === "session_expired") {
    return "Your session expired. Sign in again to continue.";
  }
  if (reason === "validation" && error instanceof Error) return error.message;
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (code.includes("invalid-verification-code")) {
    return "The verification code is incorrect. Check the code and try again.";
  }
  if (code.includes("session-expired") || code.includes("code-expired")) {
    return "This verification session expired. Send a new code to continue.";
  }
  if (code.includes("invalid-phone-number")) {
    return "Enter a valid Philippine mobile number.";
  }
  if (
    code.includes("already-exists") ||
    code.includes("credential-already-in-use") ||
    code.includes("phone-number-already-exists") ||
    code.includes("account-exists-with-different-credential")
  ) {
    return (
      "This mobile number is already associated with another " +
      "FEASTA account. Use a different mobile number."
    );
  }
  if (code.includes("requires-recent-login")) {
    return "For your security, sign in again before changing your mobile number.";
  }
  if (
    code.includes("too-many-requests") ||
    code.includes("resource-exhausted") ||
    code.includes("quota-exceeded")
  ) {
    const retryAfter =
      phoneVerificationRetryLabel(
        error,
      );

    return retryAfter
      ? `Too many verification attempts. Try again ${retryAfter}.`
      : "Too many verification attempts. Please wait before trying again.";
  }
  if (
    code.includes("captcha-check-failed") ||
    code.includes("invalid-app-credential") ||
    code.includes("missing-app-credential")
  ) {
    return "We could not confirm the security check. Refresh the page and try again.";
  }
  if (code.includes("network-request-failed")) {
    return "Check your internet connection and try again.";
  }
  return customerAuthenticationError(error);
}

export function providerAccountDetailsError(error: unknown): string {
  const reason = typeof error === "object" && error !== null && "reason" in error
    ? String(error.reason)
    : "";
  if (reason === "uid_mismatch" || reason === "account_inconsistent") {
    return "Your account relationship could not be confirmed. Sign in again or contact support.";
  }
  if (reason === "credential_not_linked") {
    return "The email sign-in method was not linked. Try again.";
  }
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (
    code.includes("email-already-in-use") ||
    code.includes("credential-already-in-use") ||
    code.includes("account-exists-with-different-credential")
  ) {
    return "This email is already associated with another account. Sign in to that account or use another email.";
  }
  if (code.includes("provider-already-linked")) {
    return "Email sign-in is already linked. Refresh the page to continue safely.";
  }
  if (code.includes("requires-recent-login") || code.includes("invalid-credential")) {
    return "Your secure phone session expired. Verify your mobile number again.";
  }
  return customerAuthenticationError(error);
}

function phoneVerificationRetryLabel(
  error: unknown,
): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const match =
    error.message.match(
      /Retry in (\d+) seconds?/iu,
    );

  if (!match) {
    return null;
  }

  const seconds =
    Number(match[1]);

  if (
    !Number.isSafeInteger(seconds) ||
    seconds <= 0
  ) {
    return null;
  }

  if (seconds < 60) {
    return `in about ${seconds} ${
      seconds === 1
        ? "second"
        : "seconds"
    }`;
  }

  const minutes =
    Math.ceil(
      seconds / 60,
    );

  if (minutes < 60) {
    return `in about ${minutes} ${
      minutes === 1
        ? "minute"
        : "minutes"
    }`;
  }

  const hours =
    Math.ceil(
      minutes / 60,
    );

  return `in about ${hours} ${
    hours === 1
      ? "hour"
      : "hours"
  }`;
}
