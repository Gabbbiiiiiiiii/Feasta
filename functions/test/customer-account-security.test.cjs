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
).replace(/\r\n/g, "\n");

test("profile callable accepts an explicit safe-field allowlist", () => {
  const content = source("auth/manage-customer-account.ts");
  for (const field of ["firstName", "lastName", "address", "city", "province"]) {
    assert.ok(content.includes(`input.${field}`));
  }
  assert.ok(content.includes("rejectUnknownFields(input"));
  for (const protectedField of [
    "input.role", "input.accountStatus", "input.isActive", "input.isBlocked",
    "input.isEmailVerified", "input.isPhoneVerified", "input.providerId",
  ]) {
    assert.equal(content.includes(protectedField), false);
  }
});

test("provider and admin account management preserve trusted fields", () => {
  const content = source("auth/manage-role-account.ts");
  assert.ok(content.includes('requireRole(actor.uid, ["provider", "admin"])'));
  assert.ok(content.includes("editableVerificationStatuses"));
  assert.ok(content.includes("activeProviderRequestStatuses"));
  assert.ok(content.includes("Resolve active event obligations"));
  assert.ok(content.includes("provider_account_deactivated"));
  assert.equal(content.includes("transaction.delete"), false);
  for (const protectedField of [
    "input.role",
    "input.accountStatus",
    "input.isActive",
    "input.isBlocked",
    "input.verificationStatus",
    "input.isFeatured",
  ]) {
    assert.equal(content.includes(protectedField), false);
  }
});

test("shared preference and session mutations require trusted roles", () => {
  const content = source("auth/manage-role-account.ts");
  assert.ok(content.includes('"customer",\n      "provider",\n      "admin"'));
  for (const name of ["updateAccountPreferences", "revokeAllAccountSessions"]) {
    const start = content.indexOf("export const " + name + " = onCall(");
    const end = content.indexOf("\nexport const ", start + 1);
    assert.ok(start >= 0 && end > start, "Expected the complete " + name + " handler.");
    const handler = content.slice(start, end);
    assert.match(handler, /appCheckCallableOptions/u);
    assert.match(handler, /const actor = requireAuth\(request\);/u);
    assert.match(handler, /await requireRole\(actor\.uid,\s*\[\s*"customer",\s*"provider",\s*"admin",?\s*\]\)/u);
    assert.match(handler, /enforceCallableRateLimit/u);
    if (name === "revokeAllAccountSessions") {
      assert.match(handler, /requireRecentAuthentication\(request\.auth\?\.token\.auth_time\)/u);
      assert.match(handler, /revokeRefreshTokens\(actor\.uid\)/u);
      assert.match(handler, /account_sessions_revoked/u);
    }
  }
  assert.ok(content.includes("requireRecentAuthentication"));
  assert.ok(content.includes("revokeRefreshTokens(actor.uid)"));
  assert.ok(content.includes("account_sessions_revoked"));
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
