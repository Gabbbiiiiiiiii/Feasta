const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const sourceRoot = path.resolve(__dirname, "../src");
const source = (relative) => readFileSync(
  path.join(sourceRoot, relative),
  "utf8",
);

const authoring = source(
  "refund-policies/refund-policy-authoring.ts",
);
const booking = source(
  "bookings/submit-booking-request.ts",
);
const index = source("index.ts");

test("refund policy authoring callables are exported with trusted controls", () => {
  for (const callable of [
    "publishProviderRefundPolicy",
    "setPackageRefundPolicyOverride",
  ]) {
    assert.ok(index.includes(callable));
  }

  for (const control of [
    "requireAuth(request)",
    "requireRole",
    "USER_ROLES.provider",
    "enforceCallableRateLimit",
    "appCheckCallableOptions",
    "executeIdempotently",
    "db.runTransaction",
    "writeAuditLogInTransaction",
  ]) {
    assert.ok(
      authoring.includes(control),
      `refund policy authoring is missing ${control}`,
    );
  }
});

test("Provider default authoring derives canonical Provider ownership", () => {
  for (const control of [
    "requireCanonicalProviderId",
    "authorizeProviderForPackageManagement",
    "providerSnapshot",
    "buildNextRefundPolicy",
    "serverTimestamp()",
  ]) {
    assert.ok(authoring.includes(control));
  }

  const fields = authoring.slice(
    authoring.indexOf("const PROVIDER_INPUT_FIELDS"),
    authoring.indexOf("]);", authoring.indexOf("const PROVIDER_INPUT_FIELDS")),
  );
  for (const forbidden of [
    "providerId",
    "policyVersion",
    "schemaVersion",
    "effectiveAt",
    "source",
  ]) {
    assert.equal(fields.includes(`"${forbidden}"`), false);
  }
});

test("package overrides use canonical ownership and preserve package lifecycle", () => {
  for (const control of [
    "authorizeOwnedPackage",
    "PACKAGE_POLICY_EDITABLE_STATUSES",
    '"draft"',
    '"published"',
    "Archived package policies cannot be changed",
  ]) {
    assert.ok(authoring.includes(control));
  }

  assert.ok(authoring.includes("refundPolicyOverride: null"));
  assert.ok(authoring.includes("refundPolicyOverrideVersion"));
  assert.ok(authoring.includes("Create a Provider default refund policy"));
  assert.equal(authoring.includes('"archived",'), false);
});

test("policy versions and timestamps are assigned inside transactions", () => {
  assert.ok(authoring.includes("parseStoredRefundPolicy"));
  assert.ok(authoring.includes("buildNextRefundPolicy"));
  assert.ok(authoring.includes("packageOverrideVersionFloor"));
  assert.ok(authoring.includes("effectiveAt: timestamp"));
  assert.ok(authoring.includes("currentPolicyVersion"));
  assert.ok(authoring.includes("refundPolicyOverrideVersion:"));
});

test("audit records identify versions without copying policy contents", () => {
  for (const action of [
    "refund_policy.published",
    "refund_policy.override_published",
    "refund_policy.override_removed",
  ]) {
    assert.ok(authoring.includes(action));
  }

  for (const block of authoring.matchAll(
    /writeAuditLogInTransaction\([\s\S]*?\n\s*\);/gu,
  )) {
    assert.ok(block[0].includes("policyVersion"));
    assert.equal(block[0].includes("rules:"), false);
    assert.equal(block[0].includes("terms:"), false);
  }
});

test("B2 leaves booking submission policy-optional and behavior-compatible", () => {
  assert.equal(booking.includes("refundPolicySnapshot"), false);
  assert.equal(booking.includes("refundPolicyAgreement"), false);
  assert.equal(booking.includes("policyAcknowledgements"), false);
  assert.equal(booking.includes("resolveEffectiveRefundPolicy"), false);
});
