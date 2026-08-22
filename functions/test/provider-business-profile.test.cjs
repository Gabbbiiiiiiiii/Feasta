const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");

const {
  PROVIDER_BUSINESS_PROFILE_EDITABLE_FIELDS,
  validateProviderBusinessProfileUpdate,
} = require("../lib/providers/provider-business-profile-domain.js");

const sourceRoot = join(__dirname, "../src");
const callable = readFileSync(
  join(sourceRoot, "providers/update-provider-business-profile.ts"),
  "utf8",
);
const providerMedia = readFileSync(
  join(sourceRoot, "providers/provider-media.ts"),
  "utf8",
);
const accountProfile = readFileSync(
  join(sourceRoot, "auth/manage-role-account.ts"),
  "utf8",
);
const rules = readFileSync(
  join(sourceRoot, "../../firebase/firestore.rules"),
  "utf8",
);

test("business profile update allowlist contains public editable fields only", () => {
  assert.deepEqual(PROVIDER_BUSINESS_PROFILE_EDITABLE_FIELDS, [
    "businessPhone",
    "description",
    "address",
    "city",
    "province",
    "logo",
    "coverImage",
  ]);

  for (const forbidden of [
    "ownerId",
    "ownerFirstName",
    "ownerLastName",
    "businessName",
    "businessEmail",
    "providerServiceType",
    "providerCategory",
    "serviceCategories",
    "verificationStatus",
    "isActive",
    "isSuspended",
    "publiclyVisible",
    "searchTokens",
  ]) {
    assert.equal(PROVIDER_BUSINESS_PROFILE_EDITABLE_FIELDS.includes(forbidden), false);
  }
});

test("business profile update normalizes public text and phone values", () => {
  assert.deepEqual(validateProviderBusinessProfileUpdate({
    businessPhone: "0917 123 4567",
    description: "  A complete public description for event customers.  ",
    address: "  123 Bonifacio Street  ",
    city: " Ormoc City ",
    province: " Leyte ",
  }), {
    businessPhone: "+639171234567",
    description: "A complete public description for event customers.",
    address: "123 Bonifacio Street",
    city: "Ormoc City",
    province: "Leyte",
  });
});

test("business profile update rejects empty and forbidden payloads", () => {
  assert.throws(
    () => validateProviderBusinessProfileUpdate({}),
    (error) => error.code === "invalid-argument",
  );

  for (const field of [
    "providerId",
    "ownerId",
    "ownerFirstName",
    "ownerLastName",
    "verificationStatus",
    "providerServiceType",
    "providerCategory",
    "serviceCategories",
    "businessName",
    "businessEmail",
  ]) {
    assert.throws(
      () => validateProviderBusinessProfileUpdate({[field]: "attacker"}),
      (error) => error.code === "invalid-argument",
      field,
    );
  }
});

test("business media input is paired and strictly allowlisted", () => {
  const logo = {
    url: "https://res.cloudinary.com/demo/image/upload/v1/feasta/providers/owner/onboarding/logo.jpg",
    publicId: "feasta/providers/owner/onboarding/logo",
  };
  assert.deepEqual(validateProviderBusinessProfileUpdate({logo}), {logo});
  assert.deepEqual(validateProviderBusinessProfileUpdate({coverImage: null}), {
    coverImage: null,
  });
  assert.throws(
    () => validateProviderBusinessProfileUpdate({logo: {url: logo.url}}),
    (error) => error.code === "invalid-argument",
  );
  assert.throws(
    () => validateProviderBusinessProfileUpdate({
      logo: {...logo, ownerId: "other"},
    }),
    (error) => error.code === "invalid-argument",
  );
});

test("callable derives ownership from the authenticated provider link", () => {
  assert.match(callable, /requireAuth\(request\)/u);
  assert.match(callable, /requireRole\(actor\.uid/u);
  assert.match(callable, /userSnapshot\.data\(\)\?\.providerId/u);
  assert.match(callable, /provider\.ownerId !== actor\.uid/u);
  assert.doesNotMatch(callable, /input\.providerId/u);
  assert.match(callable, /isApprovedProviderForOperations/u);
  assert.match(callable, /isProviderOwnerAccountActive/u);
});

test("callable verifies canonical media ownership and audits only allowlisted changes", () => {
  assert.match(callable, /verifyProviderMedia/u);
  assert.match(callable, /verifySubmittedMedia\(actor\.uid, input\)/u);
  assert.match(callable, /ownerId,\s*mediaType:/u);
  assert.match(callable, /deleteProviderMedia/u);
  assert.match(callable, /writeAuditLogInTransaction/u);
  assert.match(callable, /provider\.business_profile_updated/u);
  assert.doesNotMatch(callable, /\.\.\.request\.data/u);
});

test("linked providers cannot bypass the profile mutation when clearing media", () => {
  assert.match(providerMedia, /requireUnlinkedProviderOnboarding\(\s*actor\.uid/u);
  assert.match(providerMedia, /user\.providerId\.trim\(\)\.length > 0/u);
  assert.match(
    providerMedia,
    /Linked provider media must be removed through the business profile update/u,
  );
});

test("business profile logic is category-generic and uses no second collection", () => {
  for (const category of [
    "photographer",
    "videographer",
    "florist",
    "car_rental",
    "sound_system",
    "catering_service",
  ]) {
    assert.equal(callable.includes(`\"${category}\"`), false);
  }
  assert.equal(callable.includes("businessProfiles"), false);
  assert.match(callable, /collection\("providers"\)/u);
});

test("approved account editing cannot bypass the Business Profile callable", () => {
  assert.match(accountProfile, /publicBusinessProfileChanged/u);
  assert.match(
    accountProfile,
    /Public business information must be updated from Business Profile/u,
  );
  assert.match(accountProfile, /editableVerificationStatuses/u);
});

test("Firestore rules prevent provider clients from bypassing callables", () => {
  const providerBlock = rules.slice(
    rules.indexOf("match /providers/{providerId}"),
    rules.indexOf("match /providerVerifications/{verificationId}"),
  );
  assert.match(providerBlock, /changesOnly\(\[\s*'isDeleted'/u);
  assert.doesNotMatch(
    providerBlock,
    /ownsProvider\(providerId\)\s*&&\s*request\.resource\.data\.ownerId/u,
  );
});
