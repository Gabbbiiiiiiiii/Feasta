import assert from "node:assert/strict";
import test from "node:test";

import {
  providerAccountDestination,
  providerAccessDestination,
  resolveTrustedAccountContext,
  safeReturnPathForAccount,
} from "../src/lib/auth/account-policy.ts";

const baseProfile = {
  role: "customer",
  accountStatus: "active",
  isActive: true,
  isBlocked: false,
  isPhoneVerified: true,
  providerId: null,
};

function resolve(overrides: {
  auth?: Partial<{
    disabled: boolean;
    email: string | null;
    emailVerified: boolean;
  }>;
  profile?: Record<string, unknown> | null;
  customerProfileExists?: boolean;
  provider?: (Record<string, unknown> & {id: string}) | null;
} = {}) {
  return resolveTrustedAccountContext({
    uid: "user-one",
    auth: {
      disabled: false,
      email: "user@example.test",
      emailVerified: true,
      ...overrides.auth,
    },
    userProfile: overrides.profile === undefined
      ? baseProfile
      : overrides.profile,
    customerProfileExists: overrides.customerProfileExists ??
      (overrides.profile === undefined || overrides.profile?.role === "customer"),
    providerProfile: overrides.provider,
  });
}

test("valid customer, provider, and admin contexts use trusted records", () => {
  const customer = resolve();
  assert.equal(customer.ok && customer.account.role, "customer");

  const provider = resolve({
    profile: {...baseProfile, role: "provider", providerId: "provider-one"},
    provider: {
      id: "provider-one",
      ownerId: "user-one",
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
      providerServiceType: "catering",
      serviceCategories: [
        "catering_service",
        "food_trays_packed_meals",
        "invalid_category",
      ],
    },
  });
  assert.equal(provider.ok && provider.account.role, "provider");
  assert.equal(
    provider.ok && provider.account.provider?.verificationStatus,
    "approved",
  );

  assert.deepEqual(
    provider.ok
      ? provider.account.provider?.serviceCategories
      : null,
    [
      "catering_service",
      "food_trays_packed_meals",
    ],
  );

  const admin = resolve({profile: {...baseProfile, role: "admin"}});
  assert.equal(admin.ok && admin.account.role, "admin");
});

test("provider destinations enforce email then phone before onboarding", () => {
  const provider = {
    id: "provider-1",
    verificationStatus: "approved" as const,
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    providerServiceType: "catering" as const,
    serviceCategories: [
      "catering_service",
    ] as const,
    eventTypesSupported: [
      "birthday",
      "wedding",
    ],
    minGuestsPerEvent: 20,
    maxGuestsPerEvent: 300,
  };
  assert.equal(providerAccountDestination({
    emailVerified: false,
    isPhoneVerified: false,
    provider,
  }), "/provider-verify-email");
  assert.equal(providerAccountDestination({
    emailVerified: true,
    isPhoneVerified: false,
    provider,
  }), "/provider-verify-phone");
  assert.equal(providerAccountDestination({
    emailVerified: true,
    isPhoneVerified: true,
    provider: null,
  }), "/provider/onboarding");
  assert.equal(safeReturnPathForAccount("/provider/onboarding", {
    role: "provider",
    emailVerified: true,
    isPhoneVerified: false,
    provider: null,
  }), "/provider-verify-phone");
});

test("disabled, missing, blocked, and deactivated accounts fail closed", () => {
  assert.deepEqual(resolve({auth: {disabled: true}}), {
    ok: false,
    reason: "disabled_auth_account",
  });
  assert.deepEqual(resolve({profile: null}), {
    ok: false,
    reason: "missing_user_profile",
  });
  assert.deepEqual(resolve({
    profile: baseProfile,
    customerProfileExists: false,
  }), {
    ok: false,
    reason: "missing_customer_profile",
  });
  assert.deepEqual(resolve({profile: {...baseProfile, isBlocked: true}}), {
    ok: false,
    reason: "blocked_account",
  });
  assert.deepEqual(resolve({
    profile: {
      ...baseProfile,
      accountStatus: "pending_deletion",
      isActive: false,
    },
  }), {ok: false, reason: "deactivated_account"});
});

test("unknown roles and incorrect provider ownership fail closed", () => {
  assert.deepEqual(resolve({profile: {...baseProfile, role: "super_admin"}}), {
    ok: false,
    reason: "invalid_role",
  });
  assert.deepEqual(resolve({
    profile: {...baseProfile, role: "provider", providerId: "provider-one"},
    provider: {
      id: "provider-one",
      ownerId: "another-user",
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
    },
  }), {ok: false, reason: "invalid_provider_link"});
});

test("safe return paths are role-scoped and external redirects are denied", () => {
  const result = resolve();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    safeReturnPathForAccount("/customer/bookings", result.account),
    "/customer/bookings",
  );
  for (const unsafe of [
    "https://evil.example",
    "//evil.example",
    "/admin",
    "/provider",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/%5cevil.example",
  ]) {
    assert.equal(safeReturnPathForAccount(unsafe, result.account), "/customer");
  }
});

test("provider onboarding destinations fail closed for every verification state", () => {
  assert.equal(providerAccessDestination({provider: null}), "/provider/onboarding");
    const provider = {
    id: "provider-one",
    verificationStatus: "draft" as const,
    isActive: false,
    isSuspended: false,
    isDeleted: false,
    providerServiceType: "catering" as const,
    serviceCategories: [
      "catering_service",
    ] as const,
    eventTypesSupported: [
      "birthday",
      "wedding",
    ],
    minGuestsPerEvent: 20,
    maxGuestsPerEvent: 300,
  };
  assert.equal(providerAccessDestination({provider}), "/provider/verification");
  assert.equal(providerAccessDestination({
    provider: {...provider, verificationStatus: "resubmission_required"},
  }), "/provider/verification");
  for (const status of ["submitted", "under_review", "rejected", "suspended"] as const) {
    assert.equal(providerAccessDestination({
      provider: {...provider, verificationStatus: status},
    }), "/provider/status");
  }
  assert.equal(providerAccessDestination({
    provider: {...provider, verificationStatus: "approved", isActive: true},
  }), "/provider");
  assert.equal(providerAccessDestination({
    provider: {...provider, verificationStatus: "approved", isActive: false},
  }), "/provider/status");
  assert.equal(providerAccessDestination({
    provider: {
      ...provider,
      verificationStatus: "approved",
      isActive: true,
      isDeleted: true,
    },
  }), "/provider/status");
});
