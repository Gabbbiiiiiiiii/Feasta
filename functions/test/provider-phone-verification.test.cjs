const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = (relative) => readFileSync(
  path.join(__dirname, "../src", relative),
  "utf8",
);

test("provider SMS preparation uses trusted account data and the shared mobile validator", () => {
  const content = source("auth/prepare-provider-phone-verification.ts");
  assert.ok(content.includes('requireRole(actor.uid, ["provider"])'));
  assert.ok(content.includes("requirePhilippineMobile(input.phoneNumber)"));
  assert.ok(content.includes("requirePhilippineMobile(user.phoneNumber)"));
  assert.ok(content.includes("authUser.emailVerified"));
  assert.ok(content.includes("enforceCallableRateLimit"));
  assert.ok(content.includes("requirePhoneAvailableToUid"));
  assert.equal(content.includes("transaction.update"), false);
  assert.equal(content.includes("isPhoneVerified: false"), false);
  assert.equal(content.includes("isPhoneVerified: true"), false);
});

test("trusted sync requires Firebase evidence and fails closed for provider mismatch", () => {
  const content = source("auth/sync-phone-verification.ts");
  assert.ok(content.includes('["customer", "provider"]'));
  assert.ok(content.includes("getAuth().getUser(actor.uid)"));
  assert.ok(content.includes("requireGlobalPhoneIdentityOwnership(authUser)"));
  assert.ok(content.includes("user.phoneNumber !== phoneNumber"));
  assert.ok(content.includes("isPhoneVerified: true"));
  assert.ok(content.includes("ownerPhone: phoneNumber"));
  assert.equal(content.includes("request.data.phoneNumber"), false);
  assert.equal(content.includes("request.data.isPhoneVerified"), false);
});
