const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  normalizePhilippineMobile,
  requirePhilippineMobile,
} = require("../lib/shared/validation.js");

const identity = readFileSync(
  path.join(__dirname, "../src/auth/ensure-provider-identity.ts"),
  "utf8",
);
const draft = readFileSync(
  path.join(__dirname, "../src/providers/save-provider-onboarding-draft.ts"),
  "utf8",
);
const registration = readFileSync(
  path.join(__dirname, "../src/providers/register-provider.ts"),
  "utf8",
);

test("trusted provider mobile normalization accepts canonical formats", () => {
  for (const value of [
    "09171234567",
    "0917 123 4567",
    "0917-123-4567",
    "+639171234567",
    "+63 917 123 4567",
  ]) {
    assert.equal(normalizePhilippineMobile(value), "+639171234567");
    assert.equal(requirePhilippineMobile(value), "+639171234567");
  }
});

test("trusted provider mobile normalization rejects empty and non-mobile input", () => {
  for (const value of [
    "",
    "(053) 123 4567",
    "+63531234567",
    "08171234567",
    "+12025550123",
    "0917123456",
  ]) {
    assert.equal(normalizePhilippineMobile(value), null);
    assert.throws(
      () => requirePhilippineMobile(value),
      /Mobile number is required|valid Philippine mobile number/u,
    );
  }
});

test("provider identity cannot accept or persist client verification state", () => {
  const allowedFields = identity.slice(
    identity.indexOf("rejectUnknownFields(input"),
    identity.indexOf("]);", identity.indexOf("rejectUnknownFields(input")) + 3,
  );
  assert.equal(allowedFields.includes("isPhoneVerified"), false);
  assert.equal(allowedFields.includes("phoneVerified"), false);
  assert.equal(identity.includes("input.isPhoneVerified"), false);
  assert.equal(identity.includes("input.phoneVerified"), false);
  assert.ok(identity.includes(
    "const phoneNumber = requirePhilippineMobile(input.phoneNumber)",
  ));
  assert.ok(identity.includes("isAuthoritativeAuthPhone(authUser, phoneNumber)"));
  assert.ok(identity.includes('provider.providerId === "password"'));
  assert.ok(identity.includes("authEmail !== submittedEmail"));
  assert.ok(identity.includes("isPhoneVerified: phoneVerified"));
  assert.ok(identity.includes("requireProviderConsent"));
});

test("owner onboarding preserves only the matching trusted Auth phone", () => {
  assert.ok(draft.includes(
    "ownerPhone: requirePhilippineMobile(data.ownerPhone)",
  ));
  assert.ok(draft.includes("requireTrustedProviderIdentity(authUser, user)"));
  assert.ok(draft.includes("validated.ownerPhone !== identity.phoneNumber"));
  assert.ok(draft.includes("phoneNumber: identity.phoneNumber"));
  assert.ok(draft.includes("isPhoneVerified: true"));
  assert.ok(draft.includes(
    "businessPhone: requirePhilippinePhone(",
  ));
});

test("provider creation revalidates owner mobile and keeps business phone separate", () => {
  assert.ok(registration.includes(
    "const ownerPhone = requirePhilippineMobile(",
  ));
  assert.ok(registration.includes("ownerPhone,"));
  assert.ok(registration.includes(
    "const businessPhone = requirePhilippinePhone(",
  ));
  assert.ok(registration.includes(
    "requireTrustedProviderIdentity(authUser, userData)",
  ));
});
