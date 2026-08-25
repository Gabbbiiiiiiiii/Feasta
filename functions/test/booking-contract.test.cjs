const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");

const {
  validateBookingPackage,
} = require(
  "../lib/bookings/booking-contract.js",
);

const source = readFileSync(
  join(
    __dirname,
    "../src/bookings/submit-booking-request.ts",
  ),
  "utf8",
);
const contractSource = readFileSync(
  join(
    __dirname,
    "../src/bookings/booking-contract.ts",
  ),
  "utf8",
);

function packageRecord(overrides = {}) {
  return {
    providerId: "provider_approved",
    status: "published",
    isActive: true,
    isPublished: true,
    providerPubliclyVisible: true,
    isDeleted: false,
    eventType: "wedding",
    minimumGuests: 25,
    maximumGuests: 100,
    ...overrides,
  };
}

function validate(overrides = {}) {
  return validateBookingPackage({
    packageData:
      overrides.packageData ??
      packageRecord(),
    expectedProviderId:
      overrides.expectedProviderId ??
      "provider_approved",
    submittedEventType:
      overrides.submittedEventType ??
      "wedding",
    guestCount:
      overrides.guestCount ?? 50,
  });
}

test(
  "requires the complete public package lifecycle contract",
  () => {
    const unavailable = [
      {isActive: false},
      {isDeleted: true},
      {isPublished: false},
      {status: "draft"},
      {providerPubliclyVisible: false},
      {providerId: "another_provider"},
    ];

    for (const override of unavailable) {
      assert.deepEqual(
        validate({
          packageData:
            packageRecord(override),
        }),
        {
          valid: false,
          code: "PACKAGE_UNAVAILABLE",
        },
      );
    }

    assert.deepEqual(validate(), {
      valid: true,
      eventType: "wedding",
      minimumGuests: 25,
      maximumGuests: 100,
    });
  },
);

test(
  "enforces package guest boundaries without clamping",
  () => {
    assert.equal(
      validate({guestCount: 24}).code,
      "GUEST_COUNT_BELOW_MINIMUM",
    );
    assert.equal(
      validate({guestCount: 101}).code,
      "GUEST_COUNT_ABOVE_MAXIMUM",
    );
    assert.equal(
      validate({guestCount: 25}).valid,
      true,
    );
    assert.equal(
      validate({guestCount: 100}).valid,
      true,
    );
  },
);

test(
  "fails safely when stored guest limits are malformed",
  () => {
    for (const override of [
      {minimumGuests: "25"},
      {maximumGuests: null},
      {
        minimumGuests: 101,
        maximumGuests: 100,
      },
    ]) {
      assert.equal(
        validate({
          packageData:
            packageRecord(override),
        }).code,
        "PACKAGE_CONDITIONS_INVALID",
      );
    }
  },
);

test(
  "requires the submitted event type to match the canonical package type",
  () => {
    assert.equal(
      validate({
        submittedEventType: "birthday",
      }).code,
      "EVENT_TYPE_NOT_SUPPORTED",
    );
    assert.equal(
      validate({
        submittedEventType: "Wedding",
      }).valid,
      true,
    );
    assert.equal(
      validate({
        packageData: packageRecord({
          eventType: "custom-client-value",
        }),
      }).code,
      "PACKAGE_CONDITIONS_INVALID",
    );
  },
);

test(
  "submission performs trusted checks before creating any booking documents",
  () => {
    for (const contract of [
      "validateBookingPackage",
      "isProviderPubliclyEligible",
      "validateProviderAvailability",
      "AVAILABILITY_COUNTED_REQUEST_STATUSES",
      "addon.isPublished !== true",
      'addon.status !== "published"',
      "addon.ownerId",
    ]) {
      assert.ok(
        source.includes(contract),
        `booking submission is missing ${contract}`,
      );
    }

    assert.ok(
      contractSource.includes(
        "providerPubliclyVisible",
      ),
    );

    const packageValidation =
      source.indexOf(
        "assertBookingPackageValid(",
      );
    const availabilityValidation =
      source.indexOf(
        "assertProviderAvailable(",
      );
    const firstCreate =
      source.indexOf(
        "transaction.create(",
      );

    assert.ok(packageValidation >= 0);
    assert.ok(
      availabilityValidation >
        packageValidation,
    );
    assert.ok(
      firstCreate > availabilityValidation,
    );
  },
);

test(
  "ownership ids and prices remain server-derived",
  () => {
    assert.match(
      source,
      /customerId:\s*actor\.uid/u,
    );
    assert.match(
      source,
      /providerId:\s*cateringProviderId/u,
    );
    assert.match(
      source,
      /requireStoredMoney\(\s*packageData\.price/u,
    );
    assert.match(
      source,
      /requireStoredMoney\(\s*addon\.price/u,
    );
    assert.doesNotMatch(
      source,
      /input\.(?:customerId|price|totalAmount|downPaymentAmount)/u,
    );
  },
);

test(
  "idempotent replay is resolved before mutable catalog validation",
  () => {
    const replay =
      source.indexOf(
        "if (existingSnapshot.exists)",
      );
    const packageValidation =
      source.indexOf(
        "assertBookingPackageValid(",
      );

    assert.ok(replay >= 0);
    assert.ok(packageValidation > replay);
    assert.match(
      source,
      /submissionFingerprint !==/u,
    );
    assert.match(
      source,
      /created: false/u,
    );
  },
);
