const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  DEFAULT_PROVIDER_VAT_RATE_BPS,
  buildSuccessfulPaymentFinancialAllocation,
  inclusiveTaxComponent,
} =
  require(path.resolve(
    __dirname,
    "../lib/payments/financial-ledger-domain.js",
  ));

function financialSnapshot(
  patch = {},
) {
  return {
    schemaVersion: 1,
    currency: "PHP",

    grossAmountInCentavos:
      3_000_000,

    requiredUpfrontAmountInCentavos:
      900_000,

    remainingBalanceInCentavos:
      2_100_000,

    requiredUpfrontRateBps:
      3_000,

    platformCommissionRateBps:
      1_000,

    platformTaxStatus:
      "vat_registered",

    platformVatRateBps:
      1_200,

    financialPolicyVersion:
      4,

    providerTaxType:
      "vat_registered",

    providerTaxVerificationStatus:
      "verified",

    ...patch,
  };
}

function providerRequest(
  patch = {},
) {
  return {
    financialSnapshot:
      financialSnapshot(),

    grossSettledAmountInCentavos:
      0,

    commissionReversedInCentavos:
      0,

    ...patch,
  };
}

test(
  "full payment allocates commission, provider VAT and FEASTA VAT",
  () => {
    const allocation =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest:
          providerRequest(),

        paymentAmountInCentavos:
          3_000_000,
      });

    assert.equal(
      allocation
        .commissionAccruedForPaymentInCentavos,
      300_000,
    );

    assert.equal(
      allocation
        .commissionAccruedAfterInCentavos,
      300_000,
    );

    assert.equal(
      allocation
        .commissionEarnedAfterInCentavos,
      300_000,
    );

    assert.equal(
      allocation
        .providerVatForPaymentInCentavos,
      321_429,
    );

    assert.equal(
      allocation
        .platformVatForPaymentInCentavos,
      36_000,
    );

    assert.equal(
      allocation
        .withholdingForPaymentInCentavos,
      0,
    );

    assert.equal(
      allocation.withholdingStatus,
      "not_applied",
    );
  },
);

test(
  "deposit plus balance reconciles to the same totals as full payment",
  () => {
    const deposit =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest:
          providerRequest(),

        paymentAmountInCentavos:
          900_000,
      });

    const balance =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest:
          providerRequest({
            grossSettledAmountInCentavos:
              900_000,
          }),

        paymentAmountInCentavos:
          2_100_000,
      });

    const full =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest:
          providerRequest(),

        paymentAmountInCentavos:
          3_000_000,
      });

    assert.equal(
      deposit
        .commissionAccruedForPaymentInCentavos +
        balance
          .commissionAccruedForPaymentInCentavos,
      full
        .commissionAccruedAfterInCentavos,
    );

    assert.equal(
      deposit
        .providerVatForPaymentInCentavos +
        balance
          .providerVatForPaymentInCentavos,
      full
        .providerVatAccruedAfterInCentavos,
    );

    assert.equal(
      deposit
        .platformVatForPaymentInCentavos +
        balance
          .platformVatForPaymentInCentavos,
      full
        .platformVatAccruedAfterInCentavos,
    );
  },
);

test(
  "verified Non-VAT provider has no provider VAT component",
  () => {
    const request =
      providerRequest({
        financialSnapshot:
          financialSnapshot({
            providerTaxType:
              "non_vat",

            providerTaxVerificationStatus:
              "verified",
          }),
      });

    const allocation =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest:
          request,

        paymentAmountInCentavos:
          3_000_000,
      });

    assert.equal(
      allocation.providerVatApplicable,
      false,
    );

    assert.equal(
      allocation
        .providerVatForPaymentInCentavos,
      0,
    );

    assert.equal(
      allocation.providerVatRateBps,
      0,
    );
  },
);

test(
  "unverified VAT declaration is not authoritative for provider VAT",
  () => {
    for (
      const status of [
        "pending",
        "rejected",
      ]
    ) {
      const request =
        providerRequest({
          financialSnapshot:
            financialSnapshot({
              providerTaxType: null,

              providerTaxVerificationStatus:
                status,
            }),
        });

      const allocation =
        buildSuccessfulPaymentFinancialAllocation({
          providerRequest:
            request,

          paymentAmountInCentavos:
            3_000_000,
        });

      assert.equal(
        allocation.providerVatApplicable,
        false,
      );

      assert.equal(
        allocation
          .providerVatForPaymentInCentavos,
        0,
      );
    }
  },
);

test(
  "Non-VAT FEASTA produces no platform VAT while commission remains",
  () => {
    const request =
      providerRequest({
        financialSnapshot:
          financialSnapshot({
            platformTaxStatus:
              "non_vat",
          }),
      });

    const allocation =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest:
          request,

        paymentAmountInCentavos:
          3_000_000,
      });

    assert.equal(
      allocation
        .commissionAccruedForPaymentInCentavos,
      300_000,
    );

    assert.equal(
      allocation.platformVatApplicable,
      false,
    );

    assert.equal(
      allocation
        .platformVatForPaymentInCentavos,
      0,
    );
  },
);

test(
  "provider VAT is extracted from VAT-inclusive gross",
  () => {
    assert.equal(
      DEFAULT_PROVIDER_VAT_RATE_BPS,
      1_200,
    );

    assert.equal(
      inclusiveTaxComponent(
        3_000_000,
        1_200,
      ),
      321_429,
    );

    assert.equal(
      inclusiveTaxComponent(
        900_000,
        1_200,
      ) +
        (
          inclusiveTaxComponent(
            3_000_000,
            1_200,
          ) -
          inclusiveTaxComponent(
            900_000,
            1_200,
          )
        ),
      inclusiveTaxComponent(
        3_000_000,
        1_200,
      ),
    );
  },
);

test(
  "existing commission reversals reduce earned commission without changing accrual",
  () => {
    const allocation =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest:
          providerRequest({
            commissionReversedInCentavos:
              25_000,
          }),

        paymentAmountInCentavos:
          3_000_000,
      });

    assert.equal(
      allocation
        .commissionAccruedAfterInCentavos,
      300_000,
    );

    assert.equal(
      allocation
        .commissionReversedInCentavos,
      25_000,
    );

    assert.equal(
      allocation
        .commissionEarnedAfterInCentavos,
      275_000,
    );
  },
);

test(
  "centavo rounding remains deterministic across split payments",
  () => {
    const smallSnapshot =
      financialSnapshot({
        grossAmountInCentavos:
          101,

        platformCommissionRateBps:
          3_333,

        platformVatRateBps:
          1_200,
      });

    const first =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest: {
          financialSnapshot:
            smallSnapshot,

          grossSettledAmountInCentavos:
            0,

          commissionReversedInCentavos:
            0,
        },

        paymentAmountInCentavos:
          50,
      });

    const second =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest: {
          financialSnapshot:
            smallSnapshot,

          grossSettledAmountInCentavos:
            50,

          commissionReversedInCentavos:
            0,
        },

        paymentAmountInCentavos:
          51,
      });

    const full =
      buildSuccessfulPaymentFinancialAllocation({
        providerRequest: {
          financialSnapshot:
            smallSnapshot,

          grossSettledAmountInCentavos:
            0,

          commissionReversedInCentavos:
            0,
        },

        paymentAmountInCentavos:
          101,
      });

    assert.equal(
      first
        .commissionAccruedForPaymentInCentavos +
        second
          .commissionAccruedForPaymentInCentavos,
      full
        .commissionAccruedAfterInCentavos,
    );

    assert.equal(
      first
        .providerVatForPaymentInCentavos +
        second
          .providerVatForPaymentInCentavos,
      full
        .providerVatAccruedAfterInCentavos,
    );

    assert.equal(
      first
        .platformVatForPaymentInCentavos +
        second
          .platformVatForPaymentInCentavos,
      full
        .platformVatAccruedAfterInCentavos,
    );
  },
);

test(
  "allocation rejects overpayment and invalid financial snapshots",
  () => {
    assert.throws(
      () =>
        buildSuccessfulPaymentFinancialAllocation({
          providerRequest:
            providerRequest({
              grossSettledAmountInCentavos:
                900_000,
            }),

          paymentAmountInCentavos:
            2_100_001,
        }),
      /exceeds the provider-request gross amount/u,
    );

    assert.throws(
      () =>
        buildSuccessfulPaymentFinancialAllocation({
          providerRequest: {
            financialSnapshot:
              financialSnapshot({
                platformCommissionRateBps:
                  10_001,
              }),
          },

          paymentAmountInCentavos:
            100,
        }),
      /Platform commission rate is invalid/u,
    );
  },
);