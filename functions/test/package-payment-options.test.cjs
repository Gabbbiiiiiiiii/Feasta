const test = require("node:test");
const assert = require("node:assert/strict");
const {getApps, initializeApp} = require("firebase-admin/app");
if (!getApps().length) initializeApp({projectId: "demo-feasta-test"});
const {Timestamp} = require("firebase-admin/firestore");
const {parseCanonicalPackageWrite, assertStrictPackageGuestRange} = require("../lib/packages/package-domain.js");
const {validatePackageEditorProgress} = require("../lib/packages/package-editor-progress-v2.js");
const {
  buildPackagePaymentTermsSnapshot,
  parsePackagePaymentTermsSnapshot,
} = require("../lib/payments/package-payment-terms.js");
const {buildBookingPaymentPolicySnapshot} = require("../lib/bookings/booking-payment-eligibility-policy.js");
const {
  evaluateSubmissionPaymentEligibility,
  evaluateInitialPaymentEligibility,
  validateInitialPaymentEligibility,
  enforceInitialPaymentEligibility,
} = require("../lib/payments/initial-payment-eligibility.js");
const {
  INITIAL_PAYMENT_DEADLINE_POLICY_VERSION,
  calculateInitialPaymentDeadlineV4,
} = require("../lib/payments/initial-payment-deadline.js");
const {existingAcceptancePlan} = require("../lib/provider-requests/existing-acceptance-plan.js");
const {isPublishablePackageV2} = require("@feasta/shared-types/customer-package-v2");

function basePackageWrite(overrides = {}) {
  return {
    name: "Fiesta Package",
    description: "Complete fiesta catering package for celebrations.",
    eventType: "birthday",
    serviceCategoryCode: "catering_service",
    price: 500,
    serviceOptions: {
      drop_off: {price: 500, includedServices: ["Delivery"]},
    },
    themeOptions: [],
    paymentPolicy: "full_payment",
    depositPercentage: 100,
    minimumGuests: 20,
    maximumGuests: 100,
    imageUrl: "",
    imageUrls: [],
    foodInclusions: ["Main: Roasted Chicken"],
    decorInclusions: [],
    furnitureInclusions: [],
    serviceInclusions: [],
    ...overrides,
  };
}

function depositPolicy() {
  return buildBookingPaymentPolicySnapshot({
    platformSettings: null,
    serviceCategoryCode: "catering_service",
    serviceCategory: {bookingPolicy: {payment: {depositAllowed: true, depositMinimumNoticeHours: 72}}},
    packageId: "pkg_catering",
    packageData: {},
  });
}

test("parseCanonicalPackageWrite supports Full Payment only, Down Payment only, and Both", () => {
  const fullOnly = parseCanonicalPackageWrite(basePackageWrite({
    paymentPolicy: "full_payment",
    depositPercentage: 100,
  }));
  assert.equal(fullOnly.paymentPolicy, "full_payment");
  assert.equal(fullOnly.fullPaymentAllowed, undefined);
  assert.equal(fullOnly.depositPercentage, 100);

  const downOnly = parseCanonicalPackageWrite(basePackageWrite({
    paymentPolicy: "deposit_then_balance",
    fullPaymentAllowed: false,
    depositPercentage: 30,
  }));
  assert.equal(downOnly.paymentPolicy, "deposit_then_balance");
  assert.equal(downOnly.fullPaymentAllowed, false);
  assert.equal(downOnly.depositPercentage, 30);

  const both = parseCanonicalPackageWrite(basePackageWrite({
    paymentPolicy: "deposit_then_balance",
    fullPaymentAllowed: true,
    depositPercentage: 30,
  }));
  assert.equal(both.paymentPolicy, "deposit_then_balance");
  assert.equal(both.fullPaymentAllowed, true);
  assert.equal(both.depositPercentage, 30);

  // Reject contradictory or malformed fullPaymentAllowed values.
  assert.throws(
    () => parseCanonicalPackageWrite(basePackageWrite({
      paymentPolicy: "full_payment",
      fullPaymentAllowed: false,
      depositPercentage: 100,
    })),
    {code: "invalid-argument"},
  );
  assert.throws(
    () => parseCanonicalPackageWrite(basePackageWrite({
      paymentPolicy: "deposit_then_balance",
      fullPaymentAllowed: "false",
      depositPercentage: 30,
    })),
    {code: "invalid-argument"},
  );
});

test("buildPackagePaymentTermsSnapshot and parsePackagePaymentTermsSnapshot preserve fullPaymentAllowed", () => {
  const downOnlySnap = buildPackagePaymentTermsSnapshot({
    paymentPolicy: "deposit_then_balance",
    fullPaymentAllowed: false,
    depositPercentage: 30,
    downPaymentPercentage: 30,
    balanceDueDaysBeforeEvent: null,
    balanceDueHoursBeforeEvent: 24,
    paymentTermsSchemaVersion: 2,
  });
  assert.equal(downOnlySnap.paymentPolicy, "deposit_then_balance");
  assert.equal(downOnlySnap.fullPaymentAllowed, false);
  assert.deepEqual(parsePackagePaymentTermsSnapshot(downOnlySnap), downOnlySnap);

  const bothSnap = buildPackagePaymentTermsSnapshot({
    paymentPolicy: "deposit_then_balance",
    fullPaymentAllowed: true,
    depositPercentage: 30,
    downPaymentPercentage: 30,
    balanceDueDaysBeforeEvent: null,
    balanceDueHoursBeforeEvent: 24,
    paymentTermsSchemaVersion: 2,
  });
  assert.equal(bothSnap.fullPaymentAllowed, true);

  const fullSnap = buildPackagePaymentTermsSnapshot({
    paymentPolicy: "full_payment",
    depositPercentage: 100,
    downPaymentPercentage: 100,
    balanceDueDaysBeforeEvent: null,
    balanceDueHoursBeforeEvent: null,
    paymentTermsSchemaVersion: 2,
  });
  assert.equal(fullSnap.fullPaymentAllowed, undefined);

  // Reject contradictory snapshot where full_payment claims fullPaymentAllowed: false.
  assert.throws(
    () => parsePackagePaymentTermsSnapshot({...fullSnap, fullPaymentAllowed: false}),
    {code: "failed-precondition"},
  );
});

test("Down Payment only freezes mode minimum_only >= 72h and falls back to full_only under 72h", () => {
  const policy = depositPolicy();
  const downOnlyTerms = {
    schemaVersion: 2,
    source: "canonical_package",
    paymentPolicy: "deposit_then_balance",
    fullPaymentAllowed: false,
    depositRateBps: 3000,
    balanceDueDaysBeforeEvent: null,
    balanceDueHoursBeforeEvent: 24,
    usesLegacyPaymentTerms: false,
  };
  const bothTerms = {...downOnlyTerms, fullPaymentAllowed: true};

  const eventDate = new Date("2027-06-20T00:00:00+08:00");
  const eligible = evaluateSubmissionPaymentEligibility({
    eventDate,
    eventTime: "18:00",
    submissionTime: new Date("2027-06-10T10:00:00+08:00"),
    packagePaymentTerms: downOnlyTerms,
    bookingPaymentPolicySnapshot: policy,
  });
  assert.equal(eligible.mode, "minimum_only");
  assert.equal(eligible.depositEligible, true);
  assert.equal(eligible.reason, "deposit_eligible");

  const shortNotice = evaluateSubmissionPaymentEligibility({
    eventDate,
    eventTime: "18:00",
    submissionTime: new Date("2027-06-18T10:00:00+08:00"),
    packagePaymentTerms: downOnlyTerms,
    bookingPaymentPolicySnapshot: policy,
  });
  assert.equal(shortNotice.mode, "full_only");
  assert.equal(shortNotice.depositEligible, false);
  assert.equal(shortNotice.reason, "short_notice");

  const bothEligible = evaluateSubmissionPaymentEligibility({
    eventDate,
    eventTime: "18:00",
    submissionTime: new Date("2027-06-10T10:00:00+08:00"),
    packagePaymentTerms: bothTerms,
    bookingPaymentPolicySnapshot: policy,
  });
  assert.equal(bothEligible.mode, "minimum_or_full");
  assert.equal(bothEligible.depositEligible, true);

  // Acceptance-time evaluator also respects fullPaymentAllowed: false.
  const acceptanceEligible = evaluateInitialPaymentEligibility({
    eventDate,
    eventTime: "18:00",
    acceptanceTime: new Date("2027-06-10T10:00:00+08:00"),
    packagePaymentTerms: downOnlyTerms,
    bookingPaymentPolicySnapshot: policy,
  });
  assert.equal(acceptanceEligible.mode, "minimum_only");
});

test("enforceInitialPaymentEligibility blocks full choice on minimum_only while validateInitialPaymentEligibility and existingAcceptancePlan pass", () => {
  const policy = depositPolicy();
  const submittedAt = new Date("2027-06-10T10:00:00+08:00");
  const acceptedAt = new Date("2027-06-11T10:00:00+08:00");
  const eventDate = new Date("2027-06-20T00:00:00+08:00");
  const downOnlyTerms = {
    schemaVersion: 2,
    source: "canonical_package",
    paymentPolicy: "deposit_then_balance",
    fullPaymentAllowed: false,
    depositRateBps: 3000,
    balanceDueDaysBeforeEvent: null,
    balanceDueHoursBeforeEvent: 24,
    usesLegacyPaymentTerms: false,
  };
  const eligibility = evaluateSubmissionPaymentEligibility({
    eventDate,
    eventTime: "18:00",
    submissionTime: submittedAt,
    packagePaymentTerms: downOnlyTerms,
    bookingPaymentPolicySnapshot: policy,
  });
  const deadlineAt = calculateInitialPaymentDeadlineV4({
    acceptedAt,
    eventStartAt: eligibility.eventStartAt,
  });
  const storedRequest = {
    status: "accepted",
    providerOwnerId: "owner_1",
    acceptedAt: Timestamp.fromDate(acceptedAt),
    financialSnapshotCapturedAt: Timestamp.fromDate(acceptedAt),
    eventDate: Timestamp.fromDate(eventDate),
    eventTime: "18:00",
    eventStartAt: Timestamp.fromDate(eligibility.eventStartAt),
    amount: 1000,
    downPaymentAmount: 300,
    remainingBalance: 700,
    paymentStatus: "unpaid",
    initialPaymentDeadlinePolicyVersion: INITIAL_PAYMENT_DEADLINE_POLICY_VERSION,
    initialPaymentDeadlineAt: Timestamp.fromDate(deadlineAt),
    expiresAt: Timestamp.fromDate(deadlineAt),
    initialPaymentEligibilitySchemaVersion: 2,
    bookingPaymentPolicySnapshot: policy,
    initialPaymentEligibility: {
      ...eligibility,
      submittedAt: Timestamp.fromDate(eligibility.submittedAt),
      evaluatedAt: Timestamp.fromDate(eligibility.evaluatedAt),
      eventStartAt: Timestamp.fromDate(eligibility.eventStartAt),
    },
    financialSnapshot: {
      schemaVersion: 1,
      currency: "PHP",
      grossAmountInCentavos: 100_000,
      requiredUpfrontAmountInCentavos: 30_000,
      remainingBalanceInCentavos: 70_000,
      packagePaymentTerms: downOnlyTerms,
    },
  };

  const validated = validateInitialPaymentEligibility(storedRequest);
  assert.deepEqual(validated, {
    mode: "minimum_only",
    reason: "deposit_eligible",
    arrangedAccepted: false,
  });

  assert.doesNotThrow(() => enforceInitialPaymentEligibility(storedRequest, "minimum"));
  assert.doesNotThrow(() => enforceInitialPaymentEligibility(storedRequest, "remaining_balance"));
  assert.throws(
    () => enforceInitialPaymentEligibility(storedRequest, "full"),
    (error) => error.code === "failed-precondition" &&
      error.details?.reason === "full_payment_not_available_for_booking",
  );

  // Provider acceptance retry / expiration path must not fail when mode is minimum_only.
  const plan = existingAcceptancePlan(storedRequest, new Date("2027-06-11T12:00:00+08:00"));
  assert.equal(plan.expiresAt.toMillis(), deadlineAt.getTime());
});

test("editor progress and V2 publishability accept valid fullPaymentAllowed combinations and reject contradictions", () => {
  const progress = validatePackageEditorProgress(
    {paymentPolicy: "deposit_then_balance", fullPaymentAllowed: false, depositPercentageText: "30"},
    {maxSpecificOccasions: 10, maxThemeImages: 4},
  );
  assert.equal(progress.paymentPolicy, "deposit_then_balance");
  assert.equal(progress.fullPaymentAllowed, false);

  assert.throws(() => validatePackageEditorProgress(
    {paymentPolicy: "deposit_then_balance", fullPaymentAllowed: "yes"},
    {maxSpecificOccasions: 10, maxThemeImages: 4},
  ));

  const basePublishable = {
    sharedContractVersion: 2,
    offerSchemaVersion: 2,
    occasionSchemaVersion: 2,
    offerStructure: "fixed",
    name: "Fiesta Package",
    description: "Complete fiesta catering package for celebrations.",
    foodInclusions: ["Main: Roasted Chicken"],
    paymentTermsSchemaVersion: 2,
    paymentPolicy: "deposit_then_balance",
    fullPaymentAllowed: false,
    depositPercentage: 30,
    balanceDueHoursBeforeEvent: 24,
    balanceDueDaysBeforeEvent: null,
    imageUrl: "",
    imageUrls: [],
    themeOptions: [],
  };

  assert.equal(isPublishablePackageV2(basePublishable, 4), true);
  assert.equal(isPublishablePackageV2({...basePublishable, fullPaymentAllowed: true}, 4), true);
  assert.equal(isPublishablePackageV2({
    ...basePublishable,
    paymentPolicy: "full_payment",
    fullPaymentAllowed: undefined,
    depositPercentage: 100,
    balanceDueHoursBeforeEvent: null,
  }, 4), true);
  assert.equal(isPublishablePackageV2({
    ...basePublishable,
    paymentPolicy: "full_payment",
    fullPaymentAllowed: false,
    depositPercentage: 100,
    balanceDueHoursBeforeEvent: null,
  }, 4), false);
});

test("assertStrictPackageGuestRange rejects equal or inverted minimum/maximum guests", () => {
  assert.doesNotThrow(() => assertStrictPackageGuestRange({minimumGuests: 20, maximumGuests: 21}));
  assert.doesNotThrow(() => assertStrictPackageGuestRange({minimumGuests: 399, maximumGuests: 400}));
  assert.throws(
    () => assertStrictPackageGuestRange({minimumGuests: 20, maximumGuests: 20}),
    {code: "invalid-argument", message: "Maximum guests must be greater than minimum guests."},
  );
  assert.throws(
    () => assertStrictPackageGuestRange({minimumGuests: 400, maximumGuests: 25}),
    {code: "invalid-argument", message: "Maximum guests must be greater than minimum guests."},
  );
});
