const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  isProviderPubliclyEligible,
  shouldPublishProvider,
} = require("../lib/shared/constants.js");

const provider = {
  id: "provider-one",
  ownerId: "provider-owner",
  businessName: "FEASTA Catering",
  description: "Complete catering for public events.",
  address: "123 Event Street",
  city: "Ormoc City",
  province: "Leyte",
  providerServiceType: "catering",
  verificationStatus: "approved",
  publiclyVisible: true,
  isActive: true,
  isSuspended: false,
  isDeleted: false,
};
const owner = {
  role: "provider",
  providerId: "provider-one",
  accountStatus: "active",
  isActive: true,
  isBlocked: false,
};

test("public visibility requires provider, owner, and profile readiness", () => {
  assert.equal(isProviderPubliclyEligible(provider, owner), true);
  for (const mutation of [
    {verificationStatus: "submitted"},
    {isActive: false},
    {isSuspended: true},
    {isDeleted: true},
    {publiclyVisible: false},
    {businessName: ""},
    {providerServiceType: "unknown"},
    {id: "provider-other"},
  ]) {
    assert.equal(
      isProviderPubliclyEligible({...provider, ...mutation}, owner),
      false,
      JSON.stringify(mutation),
    );
  }
  for (const mutation of [
    {accountStatus: "pending_deletion"},
    {isActive: false},
    {isBlocked: true},
    {role: "customer"},
    {providerId: "provider-other"},
  ]) {
    assert.equal(
      isProviderPubliclyEligible(provider, {...owner, ...mutation}),
      false,
      JSON.stringify(mutation),
    );
  }
  assert.equal(shouldPublishProvider(
    {...provider, publiclyVisible: false},
    owner,
  ), true);
});

test("review and account-state workflows maintain visibility projections", () => {
  const review = fs.readFileSync(
    path.join(
      __dirname,
      "../src/verification/review-provider-verification.ts",
    ),
    "utf8",
  );
  const accountTrigger = fs.readFileSync(
    path.join(
      __dirname,
      "../src/auth/audit-account-security-state.ts",
    ),
    "utf8",
  );
  assert.match(review, /shouldPublishProvider/u);
  assert.match(review, /publiclyVisible:/u);
  assert.match(review, /providerPubliclyVisible:/u);
  assert.match(accountTrigger, /shouldPublishProvider/u);
  assert.match(accountTrigger, /providerPubliclyVisible:/u);
});

test("verification lifecycle writes immutable history linked to audit records", () => {
  const files = [
    "../src/providers/register-provider.ts",
    "../src/verification/register-verification-document.ts",
    "../src/verification/remove-verification-document.ts",
    "../src/verification/submit-provider-verification.ts",
    "../src/verification/review-provider-verification.ts",
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.match(source, /writeVerificationHistoryInTransaction/u, file);
    assert.match(source, /auditLogReference\.id/u, file);
  }
});
