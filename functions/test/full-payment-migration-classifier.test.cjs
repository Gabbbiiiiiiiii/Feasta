const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  classifyFullPaymentMigration,
} =
  require(path.resolve(
    __dirname,
    "../lib/payments/full-payment-migration-classifier.js",
  ));

function fullPackage(
  patch = {},
) {
  return {
    paymentPolicy:
      "full_payment",

    depositPercentage:
      100,

    balanceDueDaysBeforeEvent:
      null,

    downPaymentPercentage:
      100,

    ...patch,
  };
}

function legacyPackage(
  percentage,
  patch = {},
) {
  return {
    ...(percentage === undefined
      ? {}
      : {
          downPaymentPercentage:
            percentage,
        }),

    ...patch,
  };
}

function financialSnapshot(
  patch = {},
) {
  return {
    schemaVersion:
      1,

    currency:
      "PHP",

    grossAmountInCentavos:
      1_000_000,

    requiredUpfrontAmountInCentavos:
      300_000,

    remainingBalanceInCentavos:
      700_000,

    requiredUpfrontRateBps:
      3_000,

    platformCommissionRateBps:
      1_000,

    platformTaxStatus:
      "non_vat",

    platformVatRateBps:
      1_200,

    financialPolicyVersion:
      1,

    providerTaxType:
      "non_vat",

    providerTaxVerificationStatus:
      "verified",

    ...patch,
  };
}

function request(
  patch = {},
) {
  return {
    type:
      "catering",

    status:
      "pending",

    packageId:
      "package_12345678",

    mainEventId:
      "event_12345678",

    amount:
      10_000,

    downPaymentAmount:
      3_000,

    remainingBalance:
      7_000,

    financialSnapshot:
      financialSnapshot(),

    ...patch,
  };
}

function classify(
  patch = {},
) {
  return classifyFullPaymentMigration({
    packageId:
      "package_12345678",

    packageData:
      legacyPackage(30),

    ...patch,
  });
}

test(
  "canonical full-payment package is already canonical",
  () => {
    const result =
      classify({
        packageData:
          fullPackage(),
      });

    assert.equal(
      result.classification,
      "already_canonical",
    );

    assert.equal(
      result.safeToAutoMigrate,
      true,
    );

    assert.equal(
      result.proposedChanges,
      null,
    );
  },
);

test(
  "unused canonical deposit package migrates to full payment",
  () => {
    const result =
      classify({
        packageData: {
          paymentPolicy:
            "deposit_then_balance",

          depositPercentage:
            30,

          balanceDueDaysBeforeEvent:
            7,

          downPaymentPercentage:
            30,
        },
      });

    assert.equal(
      result.classification,
      "migrate_unused_package_to_full_payment",
    );

    assert.deepEqual(
      result.proposedChanges,
      {
        package: {
          paymentPolicy:
            "full_payment",

          depositPercentage:
            100,

          balanceDueDaysBeforeEvent:
            null,

          downPaymentPercentage:
            100,
        },
      },
    );
  },
);

test(
  "unused legacy fifty-percent package migrates to full payment",
  () => {
    const result =
      classify({
        packageData:
          legacyPackage(50),
      });

    assert.equal(
      result.classification,
      "migrate_unused_package_to_full_payment",
    );
  },
);

test(
  "unused legacy zero-percent package migrates to full payment",
  () => {
    const result =
      classify({
        packageData:
          legacyPackage(0),
      });

    assert.equal(
      result.classification,
      "migrate_unused_package_to_full_payment",
    );
  },
);

test(
  "unused package with missing legacy percentage migrates when no historical evidence exists",
  () => {
    const result =
      classify({
        packageData:
          legacyPackage(
            undefined,
          ),
      });

    assert.equal(
      result.classification,
      "migrate_unused_package_to_full_payment",
    );

    assert.equal(
      result.reasonCode,
      "unused_legacy_terms_missing",
    );
  },
);

test(
  "paid legacy deposit is preserved",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest:
          request(),

        payments: [
          {
            id:
              "payment_deposit",

            data: {
              status:
                "paid",

              paymentChoice:
                "minimum",

              paymentType:
                "provider_down_payment",

              amountInCentavos:
                300_000,
            },
          },
        ],
      });

    assert.equal(
      result.classification,
      "preserve_legacy_paid_deposit",
    );

    assert.equal(
      result.safeToAutoMigrate,
      false,
    );

    assert.equal(
      result.proposedChanges,
      null,
    );
  },
);

test(
  "historical fully paid finance is preserved",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest:
          request(),

        payments: [
          {
            id:
              "payment_full",

            data: {
              status:
                "paid",

              paymentChoice:
                "full",

              paymentType:
                "provider_down_payment",

              amountInCentavos:
                1_000_000,
            },
          },
        ],
      });

    assert.equal(
      result.classification,
      "preserve_historical_finance",
    );

    assert.equal(
      result.proposedChanges,
      null,
    );
  },
);

test(
  "refund ledger earning or settlement evidence is preserved",
  () => {
    for (
      const evidence of [
        {
          financialLedgerEntries: [
            {
              id: "ledger_1",
              data: {},
            },
          ],
        },
        {
          providerEarnings: [
            {
              id: "earning_1",
              data: {},
            },
          ],
        },
        {
          providerSettlements: [
            {
              id: "settlement_1",
              data: {},
            },
          ],
        },
        {
          refundRecords: [
            {
              id: "refund_1",
              data: {},
            },
          ],
        },
      ]
    ) {
      const result =
        classify({
          providerRequestId:
            "request_12345678",

          providerRequest:
            request(),

          ...evidence,
        });

      assert.equal(
        result.classification,
        "preserve_historical_finance",
      );

      assert.equal(
        result.proposedChanges,
        null,
      );
    }
  },
);

test(
  "unpaid request with frozen financial authority migrates to full payment",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest:
          request(),
      });

    assert.equal(
      result.classification,
      "migrate_unpaid_request_to_full_payment",
    );

    assert.equal(
      result.safeToAutoMigrate,
      true,
    );

    const change =
      result.proposedChanges
        .providerRequest;

    assert.equal(
      change.downPaymentPercentage,
      100,
    );

    assert.equal(
      change.downPaymentAmount,
      10_000,
    );

    assert.equal(
      change.remainingBalance,
      0,
    );
  },
);

test(
  "provider-request package mismatch fails closed",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest:
          request({
            packageId:
              "package_other",
          }),
      });

    assert.equal(
      result.classification,
      "manual_review_conflict",
    );

    assert.ok(
      result.conflicts.includes(
        "provider_request_package_mismatch",
      ),
    );
  },
);

test(
  "provider-request and snapshot amount mismatch fails closed",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest:
          request({
            amount:
              9_000,
          }),
      });

    assert.equal(
      result.classification,
      "manual_review_conflict",
    );

    assert.ok(
      result.conflicts.includes(
        "request_amount_snapshot_mismatch",
      ),
    );
  },
);

test(
  "missing authoritative gross amount fails closed",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest: {
          type:
            "catering",

          status:
            "pending",

          packageId:
            "package_12345678",

          mainEventId:
            "event_12345678",
        },
      });

    assert.equal(
      result.classification,
      "manual_review_missing_authority",
    );

    assert.equal(
      result.reasonCode,
      "authoritative_gross_missing",
    );
  },
);

test(
  "active payment identity is not automatically rewritten",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest:
          request({
            paymentId:
              "payment_existing",
          }),
      });

    assert.equal(
      result.classification,
      "manual_review_conflict",
    );
  },
);

test(
  "legacy provider_down_payment equal to gross is not misclassified as deposit",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest:
          request(),

        payments: [
          {
            id:
              "payment_full",

            data: {
              status:
                "paid",

              paymentType:
                "provider_down_payment",

              amountInCentavos:
                1_000_000,
            },
          },
        ],
      });

    assert.equal(
      result.classification,
      "preserve_historical_finance",
    );
  },
);

test(
  "missing gateway fee evidence is never invented in proposed changes",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest:
          request(),
      });

    const serialized =
      JSON.stringify(
        result.proposedChanges,
      );

    assert.doesNotMatch(
      serialized,
      /gateway.*fee/iu,
    );
  },
);

test(
  "classification is deterministic",
  () => {
    const input = {
      providerRequestId:
        "request_12345678",

      providerRequest:
        request(),
    };

    const first =
      classify(input);

    const second =
      classify(input);

    assert.deepEqual(
      second,
      first,
    );
  },
);

test(
  "unrelated sibling request is not part of one request classification",
  () => {
    const result =
      classify({
        providerRequestId:
          "request_12345678",

        providerRequest:
          request(),
      });

    const serialized =
      JSON.stringify(result);

    assert.doesNotMatch(
      serialized,
      /request_sibling/iu,
    );
  },
);

test(
  "unpaid add-on request migrates to full payment without inventing a package",
  () => {
    const result =
      classifyFullPaymentMigration({
        packageId:
          null,

        packageData:
          null,

        providerRequestId:
          "request_addon_12345678",

        providerRequest:
          request({
            type:
              "addon",

            packageId:
              null,

            financialSnapshot:
              financialSnapshot(),
          }),
      });

    assert.equal(
      result.classification,
      "migrate_unpaid_request_to_full_payment",
    );

    assert.equal(
      result.safeToAutoMigrate,
      true,
    );

    assert.equal(
      result.packageId,
      null,
    );

    const change =
      result.proposedChanges
        .providerRequest;

    assert.equal(
      change.downPaymentPercentage,
      100,
    );

    assert.equal(
      change.downPaymentAmount,
      10_000,
    );

    assert.equal(
      change.remainingBalance,
      0,
    );

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        change,
        "packagePaymentTerms",
      ),
      false,
    );
  },
);

test(
  "paid add-on deposit remains historical deposit truth",
  () => {
    const result =
      classifyFullPaymentMigration({
        packageId:
          null,

        packageData:
          null,

        providerRequestId:
          "request_addon_12345678",

        providerRequest:
          request({
            type:
              "addon",

            packageId:
              null,
          }),

        payments: [
          {
            id:
              "payment_addon_deposit",

            data: {
              status:
                "paid",

              paymentChoice:
                "minimum",

              paymentType:
                "provider_down_payment",

              amountInCentavos:
                300_000,
            },
          },
        ],
      });

    assert.equal(
      result.classification,
      "preserve_legacy_paid_deposit",
    );

    assert.equal(
      result.proposedChanges,
      null,
    );
  },
);

test(
  "terminal or historical request lifecycle never auto-migrates without preserved finance",
  () => {
    for (
      const status of [
        "rejected",
        "cancelled",
        "expired",
        "payment_processing",
        "confirmed",
        "in_progress",
        "completed",
      ]
    ) {
      const result =
        classifyFullPaymentMigration({
          packageId:
            null,

          packageData:
            null,

          providerRequestId:
            `request_${status}`,

          providerRequest:
            request({
              type:
                "addon",

              status,

              packageId:
                null,

              financialSnapshot:
                financialSnapshot(),
            }),
        });

      assert.equal(
        result.classification,
        "manual_review_conflict",
        status,
      );

      assert.equal(
        result.safeToAutoMigrate,
        false,
        status,
      );

      assert.equal(
        result.reasonCode,
        "provider_request_lifecycle_not_auto_migratable",
        status,
      );
    }
  },
);

test(
  "terminal lifecycle does not override trusted historical deposit preservation",
  () => {
    const result =
      classifyFullPaymentMigration({
        packageId:
          null,

        packageData:
          null,

        providerRequestId:
          "request_completed_deposit",

        providerRequest:
          request({
            type:
              "addon",

            status:
              "completed",

            packageId:
              null,
          }),

        payments: [
          {
            id:
              "payment_completed_deposit",

            data: {
              status:
                "paid",

              paymentChoice:
                "minimum",

              paymentType:
                "provider_down_payment",

              amountInCentavos:
                300_000,
            },
          },
        ],
      });

    assert.equal(
      result.classification,
      "preserve_legacy_paid_deposit",
    );

    assert.equal(
      result.safeToAutoMigrate,
      false,
    );

    assert.equal(
      result.proposedChanges,
      null,
    );
  },
);

test(
  "failed payment history is not silently rewritten as a new full-payment obligation",
  () => {
    const result =
      classifyFullPaymentMigration({
        packageId:
          null,

        packageData:
          null,

        providerRequestId:
          "request_failed_payment",

        providerRequest:
          request({
            type:
              "addon",

            status:
              "pending",

            packageId:
              null,
          }),

        payments: [
          {
            id:
              "payment_failed_history",

            data: {
              status:
                "failed",
            },
          },
        ],
      });

    assert.equal(
      result.classification,
      "manual_review_conflict",
    );

    assert.equal(
      result.safeToAutoMigrate,
      false,
    );

    assert.equal(
      result.reasonCode,
      "active_or_existing_payment_identity",
    );
  },
);
