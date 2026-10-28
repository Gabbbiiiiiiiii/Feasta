import {describe, expect, it} from "vitest";
import {normalizePublicPackage} from "@/lib/customer/discovery/public-package-normalization";

const providerNames = new Map([["provider_1", "Example Catering"]]);
const legacy = {providerId: "provider_1", name: "Birthday package", eventType: "birthday",
  status: "published", isPublished: true, providerPubliclyVisible: true,
  isActive: true, isDeleted: false};
const v2Fields = ["occasionScope", "occasionIds", "occasionMatchIds",
  "occasionCatalogRevision", "providerEligibilityRevision", "occasionEligibilityState"] as const;

describe("public package reader's V1/V2 boundary", () => {
  it("rejects unknown offer envelopes and present pricing fields without hiding V1", () => {
    for (const marker of [2, 3, null, undefined, "1", false]) {
      expect(normalizePublicPackage("pack_1", {...legacy, offerSchemaVersion: marker}, providerNames)).toBeNull();
    }
    for (const pricingModel of [undefined, null, "per_pax", "per_bundle"]) {
      expect(normalizePublicPackage("pack_1", {...legacy, pricingModel}, providerNames)).toBeNull();
    }
    expect(normalizePublicPackage("pack_1", {...legacy, offerSchemaVersion: 1}, providerNames)).not.toBeNull();
  });
  it("preserves an ordinary publicly visible V1 package", () => {
    expect(normalizePublicPackage("pack_1", legacy, providerNames)).not.toBeNull();
    expect(normalizePublicPackage("pack_1", {...legacy, occasionSchemaVersion: 1},
      providerNames)).not.toBeNull();
  });

  it("hides V2 and unrecognized occasion schema versions", () => {
    for (const version of [2, 3, null, "2"]) {
      expect(normalizePublicPackage("pack_1", {...legacy, occasionSchemaVersion: version},
        providerNames)).toBeNull();
    }
  });

  it("hides any partial V2 projection even if legacy scalar is present", () => {
    for (const field of v2Fields) {
      expect(normalizePublicPackage("pack_1", {...legacy, [field]: null},
        providerNames)).toBeNull();
    }
  });
});
