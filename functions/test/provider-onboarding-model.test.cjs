const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const registration = fs.readFileSync(
  path.join(__dirname, "../src/providers/register-provider.ts"),
  "utf8",
);
const identity = fs.readFileSync(
  path.join(__dirname, "../src/auth/ensure-provider-identity.ts"),
  "utf8",
);
const draft = fs.readFileSync(
  path.join(
    __dirname,
    "../src/providers/save-provider-onboarding-draft.ts",
  ),
  "utf8",
);

test("registration validates canonical optional capacity and location fields", () => {
  for (const field of [
    "locationCoordinates",
    "maxGuestsPerEvent",
    "guestCapacity",
    "acceptsMultipleEventsPerDay",
    "maxEventsPerDay",
    "availableStaffCount",
    "availableEquipmentCount",
    "serviceCategories",
    "maxServiceDistanceKm",
    "minGuestsPerEvent",
    "operatingDays",
    "bookingLeadTimeDays",
    "unavailableDates",
  ]) {
    assert.ok(registration.includes(`\"${field}\"`), field);
  }
  assert.ok(registration.includes("optionalCoordinates("));
  assert.ok(registration.includes("compatibleGuestCapacity("));
  assert.ok(registration.includes("optionalInteger("));
});

test("operations drafts validate service alignment and scheduling limits", () => {
  for (const contract of [
    "serviceCategoryMatchesProviderType",
    "Minimum guests cannot exceed maximum guests.",
    "maxServiceDistanceKm",
    "PROVIDER_OPERATING_DAYS",
    "bookingLeadTimeDays",
    "optionalIsoDateList",
  ]) {
    assert.ok(draft.includes(contract), contract);
    assert.ok(registration.includes(contract), contract);
  }
  assert.ok(draft.includes("maxEventsPerDay must be 1"));
});

test("trusted owner and lifecycle fields are backend-derived", () => {
  assert.ok(registration.includes("ownerEmail:"));
  assert.ok(registration.includes("userData?.email"));
  assert.ok(registration.includes("const ownerPhone = requirePhilippineMobile("));
  assert.ok(registration.includes("userData?.phoneNumber"));
  assert.ok(registration.includes("ownerPhone,"));
  assert.ok(registration.includes("verificationStatus: \"draft\""));
  assert.ok(registration.includes("isActive: false"));
  assert.ok(!registration.match(/input\.verificationStatus/u));
  assert.ok(!registration.match(/input\.isActive/u));
});

test("provider consent timestamps are server generated", () => {
  assert.ok(identity.includes("acceptedTerms"));
  assert.ok(identity.includes("acceptedPrivacy"));
  assert.ok(identity.includes("termsAcceptedAt: serverTimestamp()"));
  assert.ok(identity.includes("privacyAcceptedAt: serverTimestamp()"));
  assert.ok(!identity.includes("input.termsAcceptedAt"));
  assert.ok(!identity.includes("input.privacyAcceptedAt"));
});

test("onboarding drafts are server-owned, sequential, and resumable", () => {
  assert.ok(draft.includes("appCheckCallableOptions"));
  assert.ok(draft.includes("requireRole(actor.uid"));
  assert.ok(draft.includes("enforceCallableRateLimit"));
  assert.ok(draft.includes("step > expected"));
  assert.ok(draft.includes("completedSteps"));
  assert.ok(draft.includes("currentStep"));
  assert.ok(draft.includes("serverTimestamp()"));
  assert.ok(registration.includes("transaction.delete(onboardingDraftReference)"));
});

test("owner and business drafts normalize contacts and verify media", () => {
  assert.ok(draft.includes("requirePhilippinePhone"));
  assert.ok(draft.includes(".toLowerCase()"));

  // Provider onboarding media uses the canonical Cloudinary contract.
  assert.ok(draft.includes("providerMediaFields"));
  assert.ok(draft.includes("optionalCloudinaryUrl"));
  assert.ok(draft.includes("optionalCloudinaryPublicId"));
  assert.ok(draft.includes("verifyProviderMedia"));

  assert.ok(draft.includes("logoUrl"));
  assert.ok(draft.includes("logoPublicId"));
  assert.ok(draft.includes("coverImageUrl"));
  assert.ok(draft.includes("coverPublicId"));

  assert.ok(registration.includes("requirePhilippineMobile"));
  assert.ok(registration.includes("userData?.phoneNumber"));
});

test("onboarding draft inputs cannot assign lifecycle or activation fields", () => {
  for (const field of [
    "verificationStatus",
    "isActive",
    "isFeatured",
    "isSuspended",
    "approvedAt",
    "approvedBy",
  ]) {
    assert.equal(draft.includes(`data.${field}`), false, field);
    assert.equal(draft.includes(`validated.${field}`), false, field);
  }
  assert.ok(draft.includes("rejectUnknownFields"));
});
