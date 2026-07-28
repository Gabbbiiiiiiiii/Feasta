import test from "node:test";
import assert from "node:assert/strict";

import {
  PROVIDER_ONBOARDING_CLIENT_FIELDS,
  PROVIDER_SERVER_OWNED_FIELDS,
  REQUIRED_VERIFICATION_DOCUMENT_TYPES,
  parseProviderServiceType,
  parseProviderVerificationStatusStrict,
  parseVerificationDocumentStatus,
  parseVerificationDocumentType,
  providerVerificationDocumentPolicy,
  verificationDocumentsSatisfyPolicy,
  normalizePhilippinePhone,
  normalizeProviderEmail,
  validateProviderOnboardingInput,
  validateProviderOwnerIdentityInput,
} from "../dist/index.js";

const valid = {
  ownerFirstName: "Ana",
  ownerLastName: "Reyes",
  businessName: "Ana Events",
  businessEmail: " ANA@EVENTS.TEST ",
  businessPhone: "+639171234567",
  description: "Full-service event catering for celebrations.",
  providerServiceType: "both",
  providerCategory: "catering_service",
  serviceCategories: ["catering_service", "photographer"],
  address: "123 Main Street",
  city: "Ormoc City",
  province: "Leyte",
  locationCoordinates: {latitude: 11.0064, longitude: 124.6075},
  serviceAreas: ["Ormoc City", "Ormoc City"],
  maxServiceDistanceKm: 80,
  eventTypesSupported: ["wedding"],
  minGuestsPerEvent: 20,
  maxGuestsPerEvent: 500,
  acceptsMultipleEventsPerDay: true,
  maxEventsPerDay: 2,
  availableStaffCount: 20,
  availableEquipmentCount: 100,
  operatingDays: ["monday", "saturday"],
  bookingLeadTimeDays: 7,
  unavailableDates: ["2026-12-25"],
};

test("provider onboarding validation normalizes the canonical input", () => {
  const result = validateProviderOnboardingInput(valid);
  assert.equal(result.success, true);
  assert.equal(result.value.businessEmail, "ana@events.test");
  assert.deepEqual(result.value.serviceAreas, ["Ormoc City"]);
  assert.equal(result.value.providerServiceType, "both");
  assert.equal(result.value.businessPhone, "+639171234567");
  assert.equal(result.value.logoStoragePath, null);
  assert.equal(result.value.minGuestsPerEvent, 20);
  assert.deepEqual(result.value.operatingDays, ["monday", "saturday"]);
});

test("provider operations reject impossible limits and mismatched categories", () => {
  const result = validateProviderOnboardingInput({
    ...valid,
    providerServiceType: "catering",
    serviceCategories: ["photographer"],
    minGuestsPerEvent: 501,
    maxGuestsPerEvent: 500,
    maxServiceDistanceKm: -1,
    operatingDays: ["funday"],
    unavailableDates: ["not-a-date"],
  });
  assert.equal(result.success, false);
  for (const field of [
    "serviceCategories",
    "minGuestsPerEvent",
    "maxServiceDistanceKm",
    "operatingDays",
    "unavailableDates",
  ]) {
    assert.ok(result.issues.some((issue) => issue.field === field), field);
  }
});

test("provider contact normalization accepts reasonable Philippine forms", () => {
  assert.equal(normalizeProviderEmail(" Owner@Example.TEST "),
    "owner@example.test");
  assert.equal(normalizeProviderEmail("not-an-email"), null);
  assert.equal(normalizePhilippinePhone("0917 123 4567"),
    "+639171234567");
  assert.equal(normalizePhilippinePhone("(053) 123 4567"),
    "+63531234567");
  assert.equal(normalizePhilippinePhone("+1 555 1234"), null);
});

test("provider media paths accept only canonical image locations", () => {
  const allowed = validateProviderOnboardingInput({
    ...valid,
    logoStoragePath: "providers/provider-one/logo/logo.png",
    coverStoragePath: "providers/provider-one/cover/cover.webp",
  });
  assert.equal(allowed.success, true);
  const denied = validateProviderOnboardingInput({
    ...valid,
    logoStoragePath: "providers/provider-one/verification/private.pdf",
  });
  assert.equal(denied.success, false);
  assert.ok(denied.issues.some((issue) =>
    issue.field === "logoStoragePath" && issue.code === "invalid"
  ));
});

test("owner identity requires consent while timestamps remain absent", () => {
  const result = validateProviderOwnerIdentityInput({
    firstName: " Ana ",
    lastName: " Reyes ",
    email: " ANA@EXAMPLE.TEST ",
    phone: "+639171234567",
    acceptedTerms: true,
    acceptedPrivacy: true,
    termsPolicyVersion: "unversioned",
    privacyPolicyVersion: "unversioned",
  });
  assert.equal(result.success, true);
  assert.equal(result.value.email, "ana@example.test");
  assert.ok(!Object.hasOwn(result.value, "termsAcceptedAt"));

  const denied = validateProviderOwnerIdentityInput({
    ...result.value,
    acceptedPrivacy: false,
    isActive: true,
  });
  assert.equal(denied.success, false);
  assert.deepEqual(
    denied.issues.map((issue) => issue.field),
    ["acceptedPrivacy", "isActive"],
  );
});

test("legacy guest capacity and omitted operational values remain compatible", () => {
  const {
    maxGuestsPerEvent: _ignored,
    locationCoordinates: _coordinates,
    acceptsMultipleEventsPerDay: _accepts,
    maxEventsPerDay: _events,
    availableStaffCount: _staff,
    availableEquipmentCount: _equipment,
    serviceCategories: _categories,
    maxServiceDistanceKm: _distance,
    minGuestsPerEvent: _minimumGuests,
    operatingDays: _operatingDays,
    bookingLeadTimeDays: _leadTime,
    unavailableDates: _unavailableDates,
    ...legacy
  } = valid;
  const result = validateProviderOnboardingInput({
    ...legacy,
    guestCapacity: 250,
    eventTypesSupported: ["Wedding"],
  });
  assert.equal(result.success, true);
  assert.equal(result.value.maxGuestsPerEvent, 250);
  assert.equal(result.value.maxEventsPerDay, 1);
  assert.equal(result.value.acceptsMultipleEventsPerDay, false);
  assert.deepEqual(result.value.eventTypesSupported, ["wedding"]);
});

test("unknown and privileged fields fail closed", () => {
  const result = validateProviderOnboardingInput({
    ...valid,
    verificationStatus: "approved",
    isActive: true,
  });
  assert.equal(result.success, false);
  assert.deepEqual(
    result.issues.filter((issue) => issue.code === "unknown").map(
      (issue) => issue.field,
    ),
    ["verificationStatus", "isActive"],
  );
  assert.ok(!PROVIDER_ONBOARDING_CLIENT_FIELDS.includes("isActive"));
  assert.ok(PROVIDER_SERVER_OWNED_FIELDS.includes("isActive"));
});

test("safe parsers accept explicit compatibility aliases and reject unknowns", () => {
  assert.equal(parseProviderServiceType("add-on"), "addon");
  assert.equal(parseProviderServiceType("venue"), null);
  assert.equal(parseProviderVerificationStatusStrict("underReview"),
    "under_review");
  assert.equal(parseProviderVerificationStatusStrict("verified"), null);
  assert.equal(parseVerificationDocumentType("mayor_permit"),
    "mayors_permit");
  assert.equal(parseVerificationDocumentType("passport"), null);
  assert.equal(parseVerificationDocumentStatus("verified"), "verified");
  assert.equal(parseVerificationDocumentStatus("approved"), null);
});

test("required verification policy remains server-aligned", () => {
  assert.deepEqual(
    REQUIRED_VERIFICATION_DOCUMENT_TYPES,
    [
      "business_permit",
      "dti_registration",
      "bir_registration",
      "valid_id",
    ],
  );
});

test("provider document policy dynamically requires food permits", () => {
  const catering = providerVerificationDocumentPolicy({
    providerServiceType: "catering",
    serviceCategories: ["catering_service"],
  });
  assert.deepEqual(catering.requiredOneOf, [[
    "sanitary_permit",
    "mayors_permit",
  ]]);
  assert.equal(verificationDocumentsSatisfyPolicy(new Set([
    ...catering.requiredAll,
    "mayors_permit",
  ]), catering), true);
  assert.equal(verificationDocumentsSatisfyPolicy(
    new Set(catering.requiredAll),
    catering,
  ), false);
});
