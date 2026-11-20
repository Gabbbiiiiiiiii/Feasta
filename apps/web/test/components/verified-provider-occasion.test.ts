import {describe, expect, it} from "vitest";

import {hasVerifiedProviderOccasion} from
  "@/lib/customer/providers/verified-provider-occasion";

function fixture() {
  return {
    occasionId: "birthday",
    provider: {
      verificationStatus: "approved",
      publiclyVisible: true,
      isActive: true,
      isBlocked: false,
      isSuspended: false,
      isDeleted: false,
      serviceCategories: ["catering"],
      eventTypesSupported: ["wedding"],
    },
    authority: {
      revision: 3,
      approvedOccasionIds: ["birthday"],
      approvedCategoryCodes: ["catering"],
    },
    catalog: {
      revision: 7,
      activationState: "stable",
    },
    occasion: {
      id: "birthday",
      active: true,
      moderationState: "approved",
      applicableServiceCategoryCodes: ["catering"],
    },
    expectedCatalogRevision: 7,
    expectedProviderEligibilityRevision: 3,
  };
}

describe("verified provider occasion eligibility", () => {
  it("accepts an explicit grant despite different legacy event types", () => {
    expect(hasVerifiedProviderOccasion(fixture())).toBe(true);
  });

  it("does not treat legacy event types as approval evidence", () => {
    const value = fixture();
    value.provider.eventTypesSupported = ["birthday"];
    value.authority.approvedOccasionIds = [];

    expect(hasVerifiedProviderOccasion(value)).toBe(false);
  });

  it("rejects missing or unstable catalog evidence", () => {
    const value = fixture();

    expect(hasVerifiedProviderOccasion({
      ...value,
      catalog: null,
    })).toBe(false);

    expect(hasVerifiedProviderOccasion({
      ...value,
      catalog: {...value.catalog, activationState: "updating"},
    })).toBe(false);
  });

  it("rejects stale catalog and authority revisions", () => {
    const value = fixture();

    expect(hasVerifiedProviderOccasion({
      ...value,
      expectedCatalogRevision: 6,
    })).toBe(false);

    expect(hasVerifiedProviderOccasion({
      ...value,
      expectedProviderEligibilityRevision: 2,
    })).toBe(false);
  });

  it("rejects inactive, rejected, or mismatched occasions", () => {
    const value = fixture();

    for (const change of [
      {active: false},
      {moderationState: "rejected"},
      {id: "wedding"},
    ]) {
      expect(hasVerifiedProviderOccasion({
        ...value,
        occasion: {...value.occasion, ...change},
      })).toBe(false);
    }
  });

  it("requires approved category overlap", () => {
    const value = fixture();

    expect(hasVerifiedProviderOccasion({
      ...value,
      authority: {
        ...value.authority,
        approvedCategoryCodes: ["decorations"],
      },
    })).toBe(false);

    expect(hasVerifiedProviderOccasion({
      ...value,
      provider: {
        ...value.provider,
        serviceCategories: ["decorations"],
      },
    })).toBe(false);

    expect(hasVerifiedProviderOccasion({
      ...value,
      occasion: {
        ...value.occasion,
        applicableServiceCategoryCodes: ["decorations"],
      },
    })).toBe(false);
  });

  it("rejects blocked, suspended, or unapproved providers", () => {
    const value = fixture();

    for (const change of [
      {isBlocked: true},
      {isSuspended: true},
      {isActive: false},
      {publiclyVisible: false},
      {isDeleted: true},
      {verificationStatus: "pending"},
    ]) {
      expect(hasVerifiedProviderOccasion({
        ...value,
        provider: {...value.provider, ...change},
      })).toBe(false);
    }
  });

  it("rejects malformed or duplicate authority values", () => {
    const value = fixture();

    expect(hasVerifiedProviderOccasion({
      ...value,
      authority: {
        ...value.authority,
        approvedOccasionIds: ["birthday", "birthday"],
      },
    })).toBe(false);

    expect(hasVerifiedProviderOccasion({
      ...value,
      authority: {
        ...value.authority,
        approvedCategoryCodes: ["bad category"],
      },
    })).toBe(false);
  });
});