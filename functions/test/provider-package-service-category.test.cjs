const assert =
  require("node:assert/strict");

const test =
  require("node:test");

const {
  assertCanonicalPackageServiceCategory,
  assertPackageMatchesProviderCapabilities,
  parsePackageInput,
} = require(
  "../lib/packages/package-domain.js",
);

const base = {
  name:
    "Wedding Package",

  description:
    "Complete catering service for wedding events.",

  eventType:
    "wedding",

  price:
    30000,

  paymentPolicy:
    "full_payment",

  depositPercentage:
    100,

  balanceDueDaysBeforeEvent:
    null,

  minimumGuests:
    20,

  maximumGuests:
    100,

  imageUrl:
    "",

  foodInclusions:
    [],

  decorInclusions:
    [],

  furnitureInclusions:
    [],

  serviceInclusions:
    [],
};

const provider = {
  providerServiceType:
    "catering",

  serviceCategories: [
    "catering_service",
  ],

  eventTypesSupported: [
    "wedding",
  ],

  minGuestsPerEvent:
    1,

  maxGuestsPerEvent:
    500,
};

test(
  "legacy package without service category remains readable",
  () => {
    const parsed =
      parsePackageInput(base);

    assert.equal(
      parsed.serviceCategoryCode,
      null,
    );

    assert.throws(
      () =>
        assertCanonicalPackageServiceCategory(
          parsed,
        ),
      {
        code:
          "invalid-argument",
      },
    );
  },
);

test(
  "canonical package service category is accepted",
  () => {
    const parsed =
      parsePackageInput({
        ...base,

        serviceCategoryCode:
          "catering_service",
      });

    assert.equal(
      parsed.serviceCategoryCode,
      "catering_service",
    );

    assert.doesNotThrow(() =>
      assertCanonicalPackageServiceCategory(
        parsed,
      ),
    );
  },
);

test(
  "package category must belong to provider service categories",
  () => {
    const parsed =
      parsePackageInput({
        ...base,

        serviceCategoryCode:
          "catering_service",
      });

    assert.doesNotThrow(() =>
      assertPackageMatchesProviderCapabilities(
        provider,
        parsed,
      ),
    );

    assert.throws(
      () =>
        assertPackageMatchesProviderCapabilities(
          {
            ...provider,

            serviceCategories: [
              "food_trays",
            ],
          },
          parsed,
        ),
      {
        code:
          "failed-precondition",
      },
    );
  },
);

test(
  "invalid package service-category code fails parsing",
  () => {
    assert.throws(
      () =>
        parsePackageInput({
          ...base,

          serviceCategoryCode:
            "INVALID CATEGORY",
        }),
      {
        code:
          "invalid-argument",
      },
    );
  },
);
