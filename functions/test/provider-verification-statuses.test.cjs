const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PROVIDER_VERIFICATION_STATUSES,
  PROVIDER_VERIFICATION_TRANSITIONS,
  VERIFICATION_DOCUMENT_TYPES,
  REQUIRED_VERIFICATION_DOCUMENT_TYPES,
  VERIFICATION_DOCUMENT_CONTENT_TYPES,
  MAX_VERIFICATION_DOCUMENT_SIZE_BYTES,
  isRequiredVerificationDocumentType,
  providerVerificationDocumentPolicy,
  providerSubmissionProfileIssues,
  verificationDocumentsSatisfyPolicy,
  isApprovedProviderForOperations,
  isProviderVerificationTransitionAllowed,
  parseProviderServiceType,
  parseVerificationDocumentStatus,
  parseVerificationDocumentType,
} = require("../lib/shared/constants.js");

const expectedStatuses = [
  "draft",
  "submitted",
  "under_review",
  "resubmission_required",
  "approved",
  "rejected",
  "suspended",
];

const expectedTransitions = [
  ["draft", "submitted"],
  ["resubmission_required", "submitted"],
  ["submitted", "under_review"],
  ["under_review", "approved"],
  ["under_review", "rejected"],
  ["under_review", "resubmission_required"],
  ["approved", "suspended"],
];

test("provider verification exposes only canonical statuses", () => {
  assert.deepEqual(PROVIDER_VERIFICATION_STATUSES, expectedStatuses);
});

test("only a fully approved, active provider passes live-operation policy", () => {
  const approved = {
    ownerId: "provider-owner",
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
  };
  assert.equal(isApprovedProviderForOperations(approved), true);
  for (const verificationStatus of expectedStatuses.filter(
    (status) => status !== "approved",
  )) {
    assert.equal(
      isApprovedProviderForOperations({...approved, verificationStatus}),
      false,
      verificationStatus,
    );
  }
  assert.equal(isApprovedProviderForOperations({...approved, isActive: false}), false);
  assert.equal(isApprovedProviderForOperations({...approved, isSuspended: true}), false);
  assert.equal(isApprovedProviderForOperations({...approved, isDeleted: true}), false);
  assert.equal(isApprovedProviderForOperations({...approved, ownerId: ""}), false);
});

test("provider verification document policy is server-owned and canonical", () => {
  assert.deepEqual(VERIFICATION_DOCUMENT_TYPES, [
    "business_permit",
    "dti_registration",
    "bir_registration",
    "valid_id",
    "sanitary_permit",
    "mayors_permit",
    "other",
  ]);
  assert.deepEqual(REQUIRED_VERIFICATION_DOCUMENT_TYPES, [
    "business_permit",
    "dti_registration",
    "bir_registration",
    "valid_id",
  ]);
  assert.deepEqual(VERIFICATION_DOCUMENT_CONTENT_TYPES, [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  assert.equal(MAX_VERIFICATION_DOCUMENT_SIZE_BYTES, 10 * 1024 * 1024);
  assert.equal(isRequiredVerificationDocumentType("business_permit"), true);
  assert.equal(isRequiredVerificationDocumentType("valid_id"), true);
  assert.equal(isRequiredVerificationDocumentType("other"), false);
});

test("document requirements vary by provider business type", () => {
  const addon = providerVerificationDocumentPolicy({
    providerServiceType: "addon",
    serviceCategories: ["photographer"],
  });
  assert.equal(addon.requiredOneOf.length, 0);
  assert.equal(verificationDocumentsSatisfyPolicy(new Set([
    "business_permit",
    "dti_registration",
    "bir_registration",
    "valid_id",
  ]), addon), true);

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
  ]), catering), false);
  assert.equal(verificationDocumentsSatisfyPolicy(new Set([
    ...catering.requiredAll,
    "sanitary_permit",
  ]), catering), true);
});

test("provider verification permits exactly the documented transitions", () => {
  const actual = Object.entries(PROVIDER_VERIFICATION_TRANSITIONS)
    .flatMap(([from, targets]) => targets.map((to) => `${from}->${to}`))
    .sort();
  const expected = expectedTransitions
    .map(([from, to]) => `${from}->${to}`)
    .sort();
  assert.deepEqual(actual, expected);

  for (const from of expectedStatuses) {
    for (const to of expectedStatuses) {
      assert.equal(
        isProviderVerificationTransitionAllowed(from, to),
        expectedTransitions.some(([left, right]) => left === from && right === to),
        `${from} -> ${to}`,
      );
    }
  }
});

test("provider onboarding parsers align and fail closed", () => {
  assert.equal(parseProviderServiceType("catering"), "catering");
  assert.equal(parseProviderServiceType("add-on"), "addon");
  assert.equal(parseProviderServiceType("venue"), null);
  assert.equal(parseVerificationDocumentType("mayor_permit"), "mayors_permit");
  assert.equal(parseVerificationDocumentType("passport"), null);
  assert.equal(parseVerificationDocumentStatus("verified"), "verified");
  assert.equal(parseVerificationDocumentStatus("approved"), null);
});

test("provider submission requires every canonical profile section", () => {
  const complete = {
    ownerFirstName: "Ada",
    ownerLastName: "Lovelace",
    ownerEmail: "ada@feasta.test",
    ownerPhone: "+639171234567",
    businessName: "FEASTA Catering",
    businessEmail: "business@feasta.test",
    businessPhone: "+639181234567",
    description: "Complete event catering services for celebrations.",
    providerServiceType: "catering",
    providerCategory: "catering_service",
    serviceCategories: ["catering_service"],
    eventTypesSupported: ["wedding"],
    address: "123 Event Street",
    city: "Ormoc City",
    province: "Leyte",
    serviceAreas: ["Ormoc City"],
    minGuestsPerEvent: 10,
    maxGuestsPerEvent: 200,
    acceptsMultipleEventsPerDay: false,
    maxEventsPerDay: 1,
    operatingDays: ["monday"],
    bookingLeadTimeDays: 3,
  };
  assert.deepEqual(providerSubmissionProfileIssues(complete), []);
  assert.deepEqual(
    providerSubmissionProfileIssues({
      ...complete,
      serviceAreas: [],
      maxGuestsPerEvent: 0,
      operatingDays: [],
    }),
    ["guestCapacity", "operatingDays", "serviceAreas"],
  );
});
