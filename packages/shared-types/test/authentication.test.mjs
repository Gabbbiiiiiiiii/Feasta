import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTHENTICATION_GATE_KINDS,
  authenticationGatePresentation,
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

test("provider phone verification is required after email and before setup", () => {
  assert.equal(gate({
    userProfile: active({
      role: "provider",
      isPhoneVerified: false,
    }),
  }).kind, "providerPhoneVerificationRequired");
  assert.equal(gate({
    emailVerified: false,
    userProfile: active({
      role: "provider",
      isPhoneVerified: false,
    }),
  }).kind, "emailVerificationRequired");
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

test("every account gate has canonical user-facing terminology", () => {
  for (const kind of AUTHENTICATION_GATE_KINDS) {
    const presentation = authenticationGatePresentation(kind);
    assert.ok(presentation.label.trim().length > 0, `${kind} label`);
    assert.ok(presentation.message.trim().length > 0, `${kind} message`);
  }
  assert.equal(
    authenticationGatePresentation("customerPhoneVerificationRequired").message,
    "Verify your phone number before submitting a booking.",
  );
  assert.equal(
    authenticationGatePresentation("sessionExpired").message,
    "Your session ended. Sign in again to continue.",
  );
});

test("matrix includes unauthenticated and expired/revoked session outcomes", () => {
  assert.equal(resolveAuthenticationGate({
    authenticated: false,
  }).kind, "unauthenticated");
  assert.equal(resolveAuthenticationGate({
    authenticated: true,
    sessionExpired: true,
  }).kind, "sessionExpired");
});
