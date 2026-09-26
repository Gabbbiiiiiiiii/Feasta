import {describe, expect, it} from "vitest";

import {classifyProviderRegistrationRecords} from "@/lib/auth/provider-registration-classification";

const uid = "phone-auth-uid";
const phone = "+639171234567";

function providerIdentity(overrides: Record<string, unknown> = {}) {
  return {
    role: "provider",
    accountStatus: "active",
    isActive: true,
    isBlocked: false,
    phoneNumber: phone,
    providerId: null,
    ...overrides,
  };
}

function providerProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-one",
    ownerId: uid,
    verificationStatus: "draft",
    providerServiceType: "catering",
    ...overrides,
  };
}

function classify(overrides: Partial<Parameters<
  typeof classifyProviderRegistrationRecords
>[0]> = {}) {
  return classifyProviderRegistrationRecords({
    uid,
    authPhoneNumber: phone,
    userProfile: null,
    customerProfileExists: false,
    ownedProviderProfiles: [],
    linkedProviderProfile: null,
    ...overrides,
  });
}

describe("trusted provider phone registration classification", () => {
  it("permits an Auth-only phone UID to resume without creating records", () => {
    expect(classify()).toBe("auth_only");
  });

  it("recognizes a valid incomplete provider identity", () => {
    expect(classify({userProfile: providerIdentity()}))
      .toBe("provider_identity");
  });

  it("recognizes an existing provider only through its owned relationship", () => {
    const provider = providerProfile();
    expect(classify({
      userProfile: providerIdentity({providerId: provider.id}),
      ownedProviderProfiles: [provider],
      linkedProviderProfile: provider,
    })).toBe("registered_provider");
  });

  it.each(["customer", "admin"])(
    "denies conversion of a %s profile",
    (role) => {
      expect(classify({
        userProfile: providerIdentity({role}),
      })).toBe("non_provider_account");
    },
  );

  it("fails closed for a mismatched authoritative phone", () => {
    expect(classify({
      userProfile: providerIdentity({phoneNumber: "+639179999999"}),
    })).toBe("malformed_provider_relationship");
  });

  it("fails closed when a provider UID also owns a customer profile", () => {
    expect(classify({
      userProfile: providerIdentity(),
      customerProfileExists: true,
    })).toBe("malformed_provider_relationship");
  });

  it("does not resume a blocked or inactive provider identity", () => {
    expect(classify({
      userProfile: providerIdentity({
        accountStatus: "blocked",
        isActive: false,
        isBlocked: true,
      }),
    })).toBe("malformed_provider_relationship");
  });

  it("fails closed for cross-owner, missing, duplicate, and orphan providers", () => {
    const provider = providerProfile();
    expect(classify({
      userProfile: providerIdentity({providerId: provider.id}),
      ownedProviderProfiles: [provider],
      linkedProviderProfile: providerProfile({ownerId: "another-uid"}),
    })).toBe("malformed_provider_relationship");
    expect(classify({
      userProfile: providerIdentity({providerId: provider.id}),
      ownedProviderProfiles: [],
    })).toBe("malformed_provider_relationship");
    expect(classify({
      userProfile: providerIdentity({providerId: provider.id}),
      ownedProviderProfiles: [provider, providerProfile({id: "provider-two"})],
      linkedProviderProfile: provider,
    })).toBe("malformed_provider_relationship");
    expect(classify({
      ownedProviderProfiles: [provider],
    })).toBe("malformed_provider_relationship");
  });
});
