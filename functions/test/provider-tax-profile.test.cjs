const assert =
  require("node:assert/strict");

const test =
  require("node:test");

const fs =
  require("node:fs");

const path =
  require("node:path");

const {
  PROVIDER_TAX_TYPES,
  PROVIDER_TAX_VERIFICATION_STATUSES,
  normalizeProviderTin,
  parseProviderTaxVerificationStatus,
  validateProviderTaxProfileReview,
  validateProviderTaxProfileSubmission,
} =
  require(
    "../lib/providers/provider-tax-profile-domain.js",
  );

const functionsRoot =
  path.resolve(
    __dirname,
    "..",
  );

const projectRoot =
  path.resolve(
    functionsRoot,
    "..",
  );

test(
  "provider tax types remain independent canonical values",
  () => {
    assert.deepEqual(
      PROVIDER_TAX_TYPES,
      [
        "non_vat",
        "vat_registered",
      ],
    );

    assert.deepEqual(
      PROVIDER_TAX_VERIFICATION_STATUSES,
      [
        "pending",
        "verified",
        "rejected",
      ],
    );
  },
);

test(
  "submission normalizes TIN without inferring VAT status",
  () => {
    const result =
      validateProviderTaxProfileSubmission(
        {
          birRegisteredName:
            "Sample Catering Services",

          tin:
            "123-456-789-000",

          taxType:
            "non_vat",
        },
      );

    assert.deepEqual(
      result,
      {
        birRegisteredName:
          "Sample Catering Services",

        tin:
          "123456789000",

        taxType:
          "non_vat",
      },
    );

    assert.equal(
      normalizeProviderTin(
        "123 456 789",
      ),
      "123456789",
    );
  },
);

test(
  "TIN does not determine tax type",
  () => {
    const vat =
      validateProviderTaxProfileSubmission(
        {
          birRegisteredName:
            "Sample Catering Services",

          tin:
            "123-456-789-000",

          taxType:
            "vat_registered",
        },
      );

    const nonVat =
      validateProviderTaxProfileSubmission(
        {
          birRegisteredName:
            "Sample Catering Services",

          tin:
            "123-456-789-000",

          taxType:
            "non_vat",
        },
      );

    assert.equal(
      vat.taxType,
      "vat_registered",
    );

    assert.equal(
      nonVat.taxType,
      "non_vat",
    );
  },
);

test(
  "submission rejects inferred or unsupported tax labels",
  () => {
    for (
      const taxType of [
        "registered_business",
        "individual",
        "has_tin",
        "vat",
        "",
      ]
    ) {
      assert.throws(
        () =>
          validateProviderTaxProfileSubmission(
            {
              birRegisteredName:
                "Sample Catering Services",

              tin:
                "123456789000",

              taxType,
            },
          ),
      );
    }
  },
);

test(
  "submission rejects unknown fields and invalid TIN values",
  () => {
    assert.throws(
      () =>
        validateProviderTaxProfileSubmission(
          {
            birRegisteredName:
              "Sample Catering Services",

            tin:
              "ABC-456-789",

            taxType:
              "non_vat",
          },
        ),
    );

    assert.throws(
      () =>
        validateProviderTaxProfileSubmission(
          {
            birRegisteredName:
              "Sample Catering Services",

            tin:
              "123456789000",

            taxType:
              "non_vat",

            businessRegistrationType:
              "registered_business",
          },
        ),
    );
  },
);

test(
  "review requires a meaningful rejection reason",
  () => {
    assert.deepEqual(
      validateProviderTaxProfileReview(
        {
          providerId:
            "provider-one",

          action:
            "verify",

          reason: "",
        },
      ),
      {
        providerId:
          "provider-one",

        action:
          "verify",

        reason: "",
      },
    );

    assert.throws(
      () =>
        validateProviderTaxProfileReview(
          {
            providerId:
              "provider-one",

            action:
              "reject",

            reason:
              "Too short",
          },
        ),
    );

    assert.equal(
      validateProviderTaxProfileReview(
        {
          providerId:
            "provider-one",

          action:
            "reject",

          reason:
            "The submitted tax information needs correction.",
        },
      ).action,
      "reject",
    );
  },
);

test(
  "verification statuses fail closed",
  () => {
    assert.equal(
      parseProviderTaxVerificationStatus(
        "pending",
      ),
      "pending",
    );

    assert.equal(
      parseProviderTaxVerificationStatus(
        "verified",
      ),
      "verified",
    );

    assert.equal(
      parseProviderTaxVerificationStatus(
        "approved",
      ),
      null,
    );

    assert.equal(
      parseProviderTaxVerificationStatus(
        "draft",
      ),
      null,
    );
  },
);

test(
  "tax profile collection is private and backend-write-only",
  () => {
    const rules =
      fs.readFileSync(
        path.resolve(
          projectRoot,
          "firebase/firestore.rules",
        ),
        "utf8",
      );

    assert.match(
      rules,
      /match \/providerTaxProfiles\/\{providerId\}/u,
    );

    assert.match(
      rules,
      /allow read: if ownsProvider\(providerId\) \|\| isAdmin\(\);/u,
    );

    assert.match(
      rules,
      /allow create, update, delete: if false;/u,
    );
  },
);

test(
  "tax callables derive provider identity and never log full TIN",
  () => {
    const source =
      fs.readFileSync(
        path.resolve(
          functionsRoot,
          "src/providers/provider-tax-profile.ts",
        ),
        "utf8",
      );

    assert.match(
      source,
      /currentUser\.providerId/u,
    );

    assert.match(
      source,
      /tinLast4/u,
    );

    assert.doesNotMatch(
      source,
      /before:\s*\{[^}]*tin:/su,
    );

    assert.match(
      source,
      /provider\.tax_profile_verified/u,
    );

    assert.match(
      source,
      /provider\.tax_profile_rejected/u,
    );
  },
);
