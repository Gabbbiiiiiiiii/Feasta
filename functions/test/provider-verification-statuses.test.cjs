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
  isProviderVerificationTransitionAllowed,
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
