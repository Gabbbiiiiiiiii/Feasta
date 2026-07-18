import test from "node:test";
import assert from "node:assert/strict";

import {
  parseAccountStatus,
  parseProviderVerificationStatus,
  parseUserRole,
  resolveAuthenticationGate,
} from "../dist/index.js";

const active = (overrides = {}) => ({
  role: "customer",
  accountStatus: "active",
  isActive: true,
  isBlocked: false,
  isPhoneVerified: true,
  providerId: null,
  ...overrides,
});

const gate = (overrides = {}) => resolveAuthenticationGate({
  authenticated: true,
  emailVerified: true,
  userProfile: active(),
  ...overrides,
});

test("safe parsers accept canonical and explicit legacy spellings", () => {
  assert.equal(parseUserRole(" CUSTOMER "), "customer");
  assert.equal(parseAccountStatus("pendingDeletion"), "pending_deletion");
  assert.equal(parseProviderVerificationStatus("underReview"), "under_review");
  assert.equal(
    parseProviderVerificationStatus("resubmissionRequired"),
    "resubmission_required",
  );
});

test("safe parsers fail closed for unknown values", () => {
  assert.equal(parseUserRole("super_admin"), null);
  assert.equal(parseAccountStatus("enabled"), null);
  assert.equal(parseProviderVerificationStatus("verified"), null);
  assert.equal(gate({userProfile: active({isBlocked: "false"})}).kind,
    "invalidAccountState");
});

test("resolves the required customer and account-state matrix", () => {
  assert.equal(gate().kind, "customerReady");
  assert.equal(gate({emailVerified: false}).kind, "emailVerificationRequired");
  assert.equal(gate({userProfile: active({isPhoneVerified: false})}).kind,
    "customerPhoneVerificationRequired");
  assert.equal(gate({userProfile: active({isBlocked: true})}).kind, "blocked");
  assert.equal(gate({authDisabled: true}).kind, "disabledAuthAccount");
  assert.equal(gate({userProfile: active({accountStatus: "pending_deletion"})}).kind,
    "deactivated");
  assert.equal(gate({userProfile: null}).kind, "missingUserProfile");
});

test("resolves provider business setup and every verification state", () => {
  const provider = active({role: "provider", providerId: "provider-one"});
  assert.equal(gate({userProfile: active({role: "provider"})}).kind,
    "providerBusinessSetupRequired");

  const expected = {
    draft: "providerVerificationDraft",
    submitted: "providerVerificationSubmitted",
    under_review: "providerUnderReview",
    resubmission_required: "providerResubmissionRequired",
    rejected: "providerRejected",
    suspended: "providerSuspended",
  };
  for (const [verificationStatus, kind] of Object.entries(expected)) {
    assert.equal(gate({
      userProfile: provider,
      providerProfile: {verificationStatus, isActive: false},
    }).kind, kind);
  }
  assert.equal(gate({
    userProfile: provider,
    providerProfile: {
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
    },
  }).kind, "providerApproved");
});

test("resolves admin and fails closed for role violations", () => {
  assert.equal(gate({userProfile: active({role: "admin"})}).kind, "adminReady");
  assert.equal(gate({requiredRoles: ["admin"]}).kind, "forbiddenRole");
  assert.equal(gate({
    userProfile: active({role: "provider"}),
    requiredRoles: ["admin"],
  }).kind, "forbiddenRole");
  assert.equal(gate({userProfile: active({role: "owner"})}).kind, "forbiddenRole");
});
