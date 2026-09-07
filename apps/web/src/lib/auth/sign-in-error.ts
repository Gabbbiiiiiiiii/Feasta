import {authenticationGatePresentation} from "@feasta/shared-types";

export type SignInMethod = "google" | "email";

export function accessibleSignInError(error: unknown, method: SignInMethod): string {
  const value = error && typeof error === "object" ? error as {code?: unknown; reason?: unknown} : {};
  const code = typeof value.code === "string" ? value.code : "";
  switch (value.reason) {
    case "account_blocked":
    case "blocked": return authenticationGatePresentation("blocked").message;
    case "deactivated": return authenticationGatePresentation("deactivated").message;
    case "account_disabled":
    case "disabled": return authenticationGatePresentation("disabledAccount").message;
    case "missing_profile": return authenticationGatePresentation("missingUserProfile").message;
    case "unauthorized_role": return authenticationGatePresentation("forbiddenRole").message;
  }
  if (code === "auth/user-disabled") return authenticationGatePresentation("disabledAuthAccount").message;
  if (code === "auth/too-many-requests" || value.reason === "rate_limited") return "Too many sign-in attempts. Please wait before trying again.";
  if (method === "google") {
    if (value.reason === "google_unavailable" || code === "functions/unavailable") return "Google sign-in is temporarily unavailable. Please try again.";
    if (value.reason === "google_timeout") return "Google sign-in took too long. Please try again.";
    switch (code) {
      case "auth/popup-closed-by-user": return "Google sign-in was cancelled.";
      case "auth/popup-blocked": return "Your browser blocked the Google sign-in window. Allow pop-ups and try again.";
      case "auth/cancelled-popup-request": return "Another Google sign-in attempt replaced this one. Please try again.";
      case "auth/network-request-failed":
      case "auth/internal-error": return "Google sign-in is temporarily unavailable. Please try again.";
      case "auth/unauthorized-domain":
      case "auth/operation-not-allowed":
      case "auth/invalid-api-key":
      case "auth/auth-domain-config-required": return "Google sign-in is not configured for this website. Use email sign-in or contact FEASTA support.";
      case "auth/account-exists-with-different-credential":
      case "auth/credential-already-in-use":
      case "auth/email-already-in-use": return "This account is already associated with another sign-in method. Sign in using your existing method or contact FEASTA support for help linking your account.";
      default: return "Unable to sign in with Google. Please try again.";
    }
  }
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) return "The email address or password is incorrect.";
  if (code === "auth/network-request-failed") return "Check your internet connection and try again.";
  return "We could not sign you in. Check your details and try again.";
}
