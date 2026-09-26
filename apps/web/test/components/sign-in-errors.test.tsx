import {expect, it, vi, afterEach} from "vitest";
import {accessibleSignInError} from "@/lib/auth/sign-in-error";
import {authDiagnostic} from "@/lib/auth/auth-diagnostics";

it.each([
  ["auth/invalid-credential", "Unable to sign in with Google. Please try again."],
  ["auth/wrong-password", "Unable to sign in with Google. Please try again."],
  ["auth/popup-closed-by-user", "Google sign-in was cancelled."],
  ["auth/popup-blocked", "Your browser blocked the Google sign-in window. Allow pop-ups and try again."],
  ["auth/network-request-failed", "Google sign-in is temporarily unavailable. Please try again."],
  ["auth/internal-error", "Google sign-in is temporarily unavailable. Please try again."],
  ["functions/unavailable", "Google sign-in is temporarily unavailable. Please try again."],
  ["auth/unauthorized-domain", "Google sign-in is not configured for this website. Use email sign-in or contact FEASTA support."],
  ["auth/operation-not-allowed", "Google sign-in is not configured for this website. Use email sign-in or contact FEASTA support."],
  ["unknown", "Unable to sign in with Google. Please try again."],
])("maps Google %s without exposing raw errors", (code, expected) => {
  expect(accessibleSignInError({code, message: "raw private profile blocked"}, "google")).toBe(expected);
});
it.each(["auth/account-exists-with-different-credential", "auth/credential-already-in-use", "auth/email-already-in-use"])("gives existing-method guidance for %s", (code) => {
  expect(accessibleSignInError({code}, "google")).toContain("Sign in using your existing method");
});
it("keeps email invalid credentials and Google timeout separate", () => {
  expect(accessibleSignInError({code: "auth/invalid-credential"}, "email")).toBe("The email address or password is incorrect.");
  expect(accessibleSignInError({reason: "google_timeout", message: "private"}, "google")).toBe("Google sign-in took too long. Please try again.");
  expect(accessibleSignInError({reason: "google_unavailable"}, "google")).toBe("Google sign-in is temporarily unavailable. Please try again.");
});
afterEach(() => {vi.unstubAllEnvs(); vi.restoreAllMocks();});
it("logs only safe diagnostics in development and nothing in production", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("NODE_ENV", "development");
  authDiagnostic("google", "popup", "failed", {code: "auth/invalid-credential", message: "secret", token: "secret"});
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  expect(log).toHaveBeenCalledWith("[FEASTA auth]", expect.objectContaining({method: "google", stage: "popup", code: "auth/invalid-credential", credentialObtained: false}));
  vi.stubEnv("NODE_ENV", "production");
  authDiagnostic("google", "popup", "failed", {code: "auth/internal-error"});
  expect(log).toHaveBeenCalledTimes(1);
});
