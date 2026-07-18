const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveBackendAccountState,
} = require("../lib/shared/account-state.js");
const {
  parseAccountStatus,
  parseProviderVerificationStatus,
  parseUserRole,
} = require("../lib/shared/constants.js");

const active = (overrides = {}) => ({
  role: "customer",
  accountStatus: "active",
  isActive: true,
  isBlocked: false,
  ...overrides,
});

test("backend status parsers align canonical and legacy values", () => {
  assert.equal(parseUserRole("customer"), "customer");
  assert.equal(parseAccountStatus("pendingDeletion"), "pending_deletion");
  assert.equal(parseProviderVerificationStatus("underReview"), "under_review");
  assert.equal(parseUserRole("super_admin"), null);
  assert.equal(parseAccountStatus("enabled"), null);
  assert.equal(parseProviderVerificationStatus("verified"), null);
  assert.equal(resolveBackendAccountState({
    authDisabled: false,
    profile: active({isActive: "true"}),
  }).kind, "invalidAccountState");
});

test("backend account state fails closed for every inactive condition", () => {
  assert.equal(resolveBackendAccountState({authDisabled: true, profile: active()}).kind,
    "disabledAuthAccount");
  assert.equal(resolveBackendAccountState({authDisabled: false, profile: null}).kind,
    "missingUserProfile");
  assert.equal(resolveBackendAccountState({
    authDisabled: false,
    profile: active({isBlocked: true}),
  }).kind, "blocked");
  assert.equal(resolveBackendAccountState({
    authDisabled: false,
    profile: active({accountStatus: "pending_deletion"}),
  }).kind, "deactivated");
  assert.equal(resolveBackendAccountState({
    authDisabled: false,
    profile: active({accountStatus: "unexpected"}),
  }).kind, "invalidAccountState");
});

test("backend role restrictions reject customer, provider, and unknown roles", () => {
  for (const role of ["customer", "provider"]) {
    assert.equal(resolveBackendAccountState({
      authDisabled: false,
      profile: active({role}),
      allowedRoles: ["admin"],
    }).kind, "forbiddenRole");
  }
  assert.equal(resolveBackendAccountState({
    authDisabled: false,
    profile: active({role: "owner"}),
  }).kind, "forbiddenRole");
  assert.equal(resolveBackendAccountState({
    authDisabled: false,
    profile: active({role: "admin"}),
    allowedRoles: ["admin"],
  }).kind, "active");
});
