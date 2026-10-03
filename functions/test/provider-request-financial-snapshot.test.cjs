const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  buildProviderRequestFinancialSnapshot,
} =
  require(
    "../lib/provider-requests/provider-request-financial-snapshot.js",
  );

function providerRequest(
  patch = {},
) {
  return {
    amount: 30000,

    downPaymentAmount:
      9000,

    remainingBalance:
      21000,

    ...patch,
  };
}

function verifiedTaxProfile(
  patch = {},
) {
  return {
    providerId:
      "provider_test",

    ownerId:
      "owner_test",

    taxType:
      "vat_registered",

    verificationStatus:
      "verified",

    ...patch,
  };
}

test(
  "snapshots money in centavos and uses safe platform defaults",
  () => {
    const result =
      buildProviderRequestFinancialSnapshot(
        {
          providerId:
            "provider_test",

          providerOwnerId:
            "owner_test",

          providerRequest:
            providerRequest(),

          platformSettings:
            null,

          providerTaxProfile:
            null,
        },
      );

    assert.deepEqual(
      result,
      {
        schemaVersion: 1,

        currency: "PHP",

        packagePaymentTerms:
          null,

        grossAmountInCentavos:
          3000000,

        requiredUpfrontAmountInCentavos:
          900000,

        remainingBalanceInCentavos:
          2100000,

        requiredUpfrontRateBps:
          3000,

        platformCommissionRateBps:
          1000,

        platformTaxStatus:
          "non_vat",

        platformVatRateBps:
          1200,

        financialPolicyVersion:
          1,

        providerTaxType:
          null,

        providerTaxVerificationStatus:
          null,
      },
    );
  },
);

test(
  "snapshots the stored FEASTA financial policy",
  () => {
    const result =
      buildProviderRequestFinancialSnapshot(
        {
          providerId:
            "provider_test",

          providerOwnerId:
            "owner_test",

          providerRequest:
            providerRequest(),

          platformSettings: {
            platformCommissionRateBps:
              1250,

            platformTaxStatus:
              "vat_registered",

            platformVatRateBps:
              1200,

            financialPolicyVersion:
              4,
          },

          providerTaxProfile:
            null,
        },
      );

    assert.equal(
      result
        .platformCommissionRateBps,
      1250,
    );

    assert.equal(
      result.platformTaxStatus,
      "vat_registered",
    );

    assert.equal(
      result.platformVatRateBps,
      1200,
    );

    assert.equal(
      result.financialPolicyVersion,
      4,
    );
  },
);

test(
  "only a verified provider tax profile makes tax type authoritative",
  () => {
    const verified =
      buildProviderRequestFinancialSnapshot(
        {
          providerId:
            "provider_test",

          providerOwnerId:
            "owner_test",

          providerRequest:
            providerRequest(),

          platformSettings:
            null,

          providerTaxProfile:
            verifiedTaxProfile(),
        },
      );

    assert.equal(
      verified.providerTaxType,
      "vat_registered",
    );

    assert.equal(
      verified
        .providerTaxVerificationStatus,
      "verified",
    );

    for (
      const verificationStatus of [
        "pending",
        "rejected",
      ]
    ) {
      const result =
        buildProviderRequestFinancialSnapshot(
          {
            providerId:
              "provider_test",

            providerOwnerId:
              "owner_test",

            providerRequest:
              providerRequest(),

            platformSettings:
              null,

            providerTaxProfile:
              verifiedTaxProfile({
                verificationStatus,
              }),
          },
        );

      assert.equal(
        result.providerTaxType,
        null,
      );

      assert.equal(
        result
          .providerTaxVerificationStatus,
        verificationStatus,
      );
    }
  },
);

test(
  "carries the immutable package payment terms into the financial snapshot",
  () => {
    const packagePaymentTerms = {
      schemaVersion: 1,

      source:
        "canonical_package",

      paymentPolicy:
        "deposit_then_balance",

      depositRateBps:
        3000,

      balanceDueDaysBeforeEvent:
        7,

      usesLegacyPaymentTerms:
        false,
    };

    const result =
      buildProviderRequestFinancialSnapshot(
        {
          providerId:
            "provider_test",

          providerOwnerId:
            "owner_test",

          providerRequest:
            providerRequest({
              packagePaymentTerms,
            }),

          platformSettings:
            null,

          providerTaxProfile:
            null,
        },
      );

    assert.deepEqual(
      result.packagePaymentTerms,
      packagePaymentTerms,
    );
  },
);

test(
  "supports legacy zero-upfront requests without inventing a new deposit",
  () => {
    const result =
      buildProviderRequestFinancialSnapshot(
        {
          providerId:
            "provider_test",

          providerOwnerId:
            "owner_test",

          providerRequest:
            providerRequest({
              downPaymentAmount: 0,
              remainingBalance:
                30000,
            }),

          platformSettings:
            null,

          providerTaxProfile:
            null,
        },
      );

    assert.equal(
      result
        .requiredUpfrontAmountInCentavos,
      0,
    );

    assert.equal(
      result.requiredUpfrontRateBps,
      0,
    );
  },
);

test(
  "rejects inconsistent provider-request money",
  () => {
    for (
      const patch of [
        {
          amount: -1,
        },
        {
          amount: 100,
          downPaymentAmount:
            120,
          remainingBalance: 0,
        },
        {
          amount: 100,
          downPaymentAmount:
            20,
          remainingBalance: 79,
        },
      ]
    ) {
      assert.throws(
        () =>
          buildProviderRequestFinancialSnapshot(
            {
              providerId:
                "provider_test",

              providerOwnerId:
                "owner_test",

              providerRequest:
                providerRequest(
                  patch,
                ),

              platformSettings:
                null,

              providerTaxProfile:
                null,
            },
          ),

        {
          code:
            "failed-precondition",
        },
      );
    }
  },
);

test(
  "rejects malformed or cross-linked provider tax profiles",
  () => {
    for (
      const profile of [
        verifiedTaxProfile({
          providerId:
            "provider_other",
        }),

        verifiedTaxProfile({
          ownerId:
            "owner_other",
        }),

        verifiedTaxProfile({
          taxType:
            "has_tin",
        }),

        verifiedTaxProfile({
          verificationStatus:
            "approved",
        }),
      ]
    ) {
      assert.throws(
        () =>
          buildProviderRequestFinancialSnapshot(
            {
              providerId:
                "provider_test",

              providerOwnerId:
                "owner_test",

              providerRequest:
                providerRequest(),

              platformSettings:
                null,

              providerTaxProfile:
                profile,
            },
          ),

        {
          code:
            "failed-precondition",
        },
      );
    }
  },
);

test(
  "acceptance captures the snapshot from trusted server documents",
  () => {
    const root =
      path.resolve(
        __dirname,
        "..",
      );

    const source =
      fs.readFileSync(
        path.join(
          root,
          "src/provider-requests/accept-provider-request.ts",
        ),
        "utf8",
      );

    assert.match(
      source,
      /buildProviderRequestFinancialSnapshot/u,
    );

    assert.match(
      source,
      /\.collection\("appSettings"\)/u,
    );

    assert.match(
      source,
      /\.doc\("platform"\)/u,
    );

    assert.match(
      source,
      /"providerTaxProfiles"/u,
    );

    assert.match(
      source,
      /financialSnapshotCapturedAt/u,
    );

    assert.match(
      source,
      /financialSnapshot,/u,
    );
  },
);

test(
  "financial snapshot does not duplicate provider tax identity",
  () => {
    const root =
      path.resolve(
        __dirname,
        "..",
      );

    const source =
      fs.readFileSync(
        path.join(
          root,
          "src/provider-requests/provider-request-financial-snapshot.ts",
        ),
        "utf8",
      );

    assert.doesNotMatch(
      source,
      /\btin\b/iu,
    );

    assert.doesNotMatch(
      source,
      /birRegisteredName/iu,
    );
  },
);
