const assert = require("node:assert/strict");
const test = require("node:test");

const {
  deriveTrustedProviderIdentityEvidence,
  isAuthoritativeAuthPhone,
  requireTrustedProviderIdentity,
} = require("../lib/shared/provider-identity-prerequisites.js");

const authUser = (overrides = {}) => ({
  uid: "provider-owner",
  disabled: false,
  email: "provider@feasta.test",
  emailVerified: true,
  phoneNumber: "+639171234567",
  providerData: [
    {providerId: "password"},
    {providerId: "phone"},
  ],
  ...overrides,
});

const profile = (overrides = {}) => ({
  phoneNumber: "+639171234567",
  isPhoneVerified: true,
  ...overrides,
});

test("trusted identity evidence comes only from Auth and matching profile state", () => {
  assert.deepEqual(
    deriveTrustedProviderIdentityEvidence(authUser(), profile()),
    {
      emailCredentialLinked: true,
      emailVerified: true,
      phoneAuthenticated: true,
      phoneNumber: "+639171234567",
      phoneVerified: true,
    },
  );
  assert.equal(
    deriveTrustedProviderIdentityEvidence(
      authUser(),
      profile({phoneNumber: "+639179999999"}),
    ).phoneVerified,
    false,
  );
  assert.equal(
    deriveTrustedProviderIdentityEvidence(
      authUser({providerData: [{providerId: "password"}]}),
      profile(),
    ).phoneVerified,
    false,
  );
});

test("email and trusted phone prerequisites fail closed", () => {
  assert.throws(
    () => requireTrustedProviderIdentity(
      authUser({emailVerified: false}),
      profile(),
    ),
    /Verify your email address/u,
  );
  assert.throws(
    () => requireTrustedProviderIdentity(
      authUser(),
      profile({isPhoneVerified: false}),
    ),
    /Verify your mobile number/u,
  );
  assert.throws(
    () => requireTrustedProviderIdentity(
      authUser({disabled: true}),
      profile(),
    ),
    /authentication account is disabled/u,
  );
});

test("phone-first identity initialization accepts only matching Auth phone proof", () => {
  assert.equal(
    isAuthoritativeAuthPhone(authUser(), "+639171234567"),
    true,
  );
  assert.equal(
    isAuthoritativeAuthPhone(authUser(), "+639179999999"),
    false,
  );
  assert.equal(
    isAuthoritativeAuthPhone(
      authUser({providerData: [{providerId: "password"}]}),
      "+639171234567",
    ),
    false,
  );
});
