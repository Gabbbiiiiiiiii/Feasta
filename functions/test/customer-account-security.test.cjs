const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {requireRecentAuthentication} = require(
  "../lib/shared/recent-auth.js",
);

const source = (relative) => readFileSync(
  path.resolve(__dirname, "../src", relative),
  "utf8",
);

test("profile callable accepts an explicit safe-field allowlist", () => {
  const content = source("auth/manage-customer-account.ts");
  for (const field of ["firstName", "lastName", "address", "city", "province"]) {
    assert.ok(content.includes(`input.${field}`));
  }
  for (const protectedField of [
    "input.role", "input.accountStatus", "input.isActive", "input.isBlocked",
    "input.isEmailVerified", "input.isPhoneVerified", "input.providerId",
  ]) {
    assert.equal(content.includes(protectedField), false);
  }
});

test("deactivation is soft, audited, and revokes sessions", () => {
  const content = source("auth/manage-customer-account.ts");
  assert.ok(content.includes('accountStatus: "pending_deletion"'));
  assert.ok(content.includes("customer_account_deactivated"));
  assert.ok(content.includes("revokeRefreshTokens(actor.uid)"));
  assert.equal(content.includes("transaction.delete"), false);
});

test("email synchronization uses trusted Auth state for both profiles", () => {
  const content = source("auth/sync-user-auth-state.ts");
  assert.ok(content.includes("authUser.email"));
  assert.ok(content.includes("transaction.update(customerReference"));
  assert.ok(content.includes("account_email_synchronized"));
  assert.ok(content.includes("Email address updated"));
});

test("preferences use server timestamps and cannot accept actor fields", () => {
  const content = source("auth/manage-customer-account.ts");
  assert.ok(content.includes("preferencesUpdatedAt: serverTimestamp()"));
  assert.ok(content.includes("marketingConsentUpdatedAt: serverTimestamp()"));
  assert.equal(content.includes("input.actorId"), false);
  assert.equal(content.includes("input.updatedAt"), false);
});

test("recent-authentication boundary accepts fresh and rejects stale claims", () => {
  const now = 2_000_000_000;
  assert.doesNotThrow(() => requireRecentAuthentication(now - 299, now));
  assert.throws(
    () => requireRecentAuthentication(now - 301, now),
    (error) => error.code === "unauthenticated",
  );
  assert.throws(
    () => requireRecentAuthentication(undefined, now),
    (error) => error.code === "unauthenticated",
  );
});
