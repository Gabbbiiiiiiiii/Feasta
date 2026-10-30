import {describe, expect, it} from "vitest";
import {policyConsentDisplay} from "@/lib/auth/policy-consent-display";

describe("provider policy consent display", () => {
  it("labels historical unversioned acceptance without a newer version", () => {
    expect(policyConsentDisplay(true, "unversioned"))
      .toBe("Accepted (version not recorded)");
    expect(policyConsentDisplay(true, ""))
      .toBe("Accepted (version not recorded)");
  });
  it("shows the recorded version only when accepted", () => {
    expect(policyConsentDisplay(true, "older-version"))
      .toBe("Accepted (version older-version)");
    expect(policyConsentDisplay(false, "newer-version")).toBe("Not recorded");
  });
});
