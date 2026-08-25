import {describe, expect, it} from "vitest";

import {
  isRecoverableProviderRecaptchaError,
  providerAccountDetailsError,
  providerPhoneVerificationError,
} from "@/lib/auth/error-messages";

describe("provider phone registration error normalization", () => {
  it.each([
    ["auth/invalid-phone-number", "Enter a valid Philippine mobile number."],
    ["auth/missing-phone-number", "Enter a valid Philippine mobile number."],
    ["auth/invalid-verification-code", "The verification code is incorrect."],
    ["auth/code-expired", "This verification session expired."],
    ["auth/session-expired", "This verification session expired."],
    ["auth/too-many-requests", "Too many verification attempts."],
    ["auth/quota-exceeded", "Too many verification attempts."],
    ["auth/captcha-check-failed", "Security verification was reset."],
    ["auth/invalid-app-credential", "Security verification was reset."],
    ["auth/missing-app-credential", "Security verification was reset."],
    ["auth/network-request-failed", "Check your internet connection"],
  ])("maps %s to a safe message", (code, expected) => {
    const message = providerPhoneVerificationError({code});
    expect(message).toContain(expected);
    expect(message).not.toContain(code);
  });

  it("does not expose unknown Firebase internals", () => {
    const message = providerPhoneVerificationError({
      code: "auth/internal-error",
      message: "raw-provider-uid-and-stack",
    });
    expect(message).toBe("We could not complete that request. Please try again.");
    expect(message).not.toContain("raw-provider-uid-and-stack");
  });

  it("identifies only supported recoverable verifier failures", () => {
    expect(isRecoverableProviderRecaptchaError({code: "auth/captcha-check-failed"}))
      .toBe(true);
    expect(isRecoverableProviderRecaptchaError({code: "auth/invalid-app-credential"}))
      .toBe(true);
    expect(isRecoverableProviderRecaptchaError({code: "auth/missing-app-credential"}))
      .toBe(true);
    expect(isRecoverableProviderRecaptchaError({code: "auth/network-request-failed"}))
      .toBe(false);
  });
});

describe("provider account-details error normalization", () => {
  it.each([
    "auth/email-already-in-use",
    "auth/credential-already-in-use",
    "auth/account-exists-with-different-credential",
  ])("keeps %s collision recovery private", (code) => {
    const message = providerAccountDetailsError({
      code,
      message: "another-user-secret-uid",
    });
    expect(message).toBe(
      "This email is already associated with another account. Sign in to that account or use another email.",
    );
    expect(message).not.toContain(code);
    expect(message).not.toContain("secret-uid");
  });

  it("maps idempotent and recent-auth recovery safely", () => {
    expect(providerAccountDetailsError({code: "auth/provider-already-linked"}))
      .toMatch(/already linked/i);
    expect(providerAccountDetailsError({code: "auth/requires-recent-login"}))
      .toMatch(/phone session expired/i);
    expect(providerAccountDetailsError({code: "auth/invalid-credential"}))
      .toMatch(/phone session expired/i);
  });

  it("maps weak-password and network errors through shared auth handling", () => {
    expect(providerAccountDetailsError({code: "auth/weak-password"}))
      .toMatch(/stronger password/i);
    expect(providerAccountDetailsError({code: "auth/network-request-failed"}))
      .toMatch(/internet connection/i);
  });
});
