import test from "node:test";
import assert from "node:assert/strict";

import {
  BASIS_POINTS_SCALE,
  CUSTOMER_PAYMENT_CHOICES,
  DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
  DEFAULT_PLATFORM_VAT_RATE_BPS,
  MAX_BALANCE_DUE_DAYS_BEFORE_EVENT,
  MAX_DEPOSIT_RATE_BPS,
  MIN_BALANCE_DUE_DAYS_BEFORE_EVENT,
  MIN_DEPOSIT_RATE_BPS,
  PACKAGE_PAYMENT_POLICIES,
  TAX_REGISTRATION_STATUSES,
  allocateCumulativeBasisPoints,
  applyBasisPoints,
  basisPointsToPercentage,
  centavosToPesos,
  isAllowedBalanceDueDays,
  isAllowedDepositRateBps,
  parseCustomerPaymentChoice,
  parsePackagePaymentPolicy,
  parseTaxRegistrationStatus,
  percentageToBasisPoints,
  pesosToCentavos,
} from "../dist/index.js";

test(
  "canonical payment policies and customer choices fail closed",
  () => {
    assert.deepEqual(
      PACKAGE_PAYMENT_POLICIES,
      [
        "full_payment",
        "deposit_then_balance",
      ],
    );

    assert.deepEqual(
      CUSTOMER_PAYMENT_CHOICES,
      [
        "minimum",
        "full",
        "remaining_balance",
      ],
    );

    assert.equal(
      parsePackagePaymentPolicy(
        "full_payment",
      ),
      "full_payment",
    );

    assert.equal(
      parsePackagePaymentPolicy(
        "deposit_then_balance",
      ),
      "deposit_then_balance",
    );

    assert.equal(
      parsePackagePaymentPolicy(
        "installment",
      ),
      null,
    );

    assert.equal(
      parseCustomerPaymentChoice(
        "minimum",
      ),
      "minimum",
    );

    assert.equal(
      parseCustomerPaymentChoice(
        "full",
      ),
      "full",
    );

    assert.equal(
      parseCustomerPaymentChoice(
        "remaining_balance",
      ),
      "remaining_balance",
    );

    assert.equal(
      parseCustomerPaymentChoice(
        "custom_amount",
      ),
      null,
    );
  },
);

test("tax registration statuses fail closed", () => {
  assert.deepEqual(
    TAX_REGISTRATION_STATUSES,
    [
      "non_vat",
      "vat_registered",
    ],
  );

  assert.equal(
    parseTaxRegistrationStatus(
      "non_vat",
    ),
    "non_vat",
  );

  assert.equal(
    parseTaxRegistrationStatus(
      "vat_registered",
    ),
    "vat_registered",
  );

  assert.equal(
    parseTaxRegistrationStatus(
      "has_tin",
    ),
    null,
  );

  assert.equal(
    parseTaxRegistrationStatus(
      "business",
    ),
    null,
  );
});

test(
  "P0 deposit and balance bounds are canonical",
  () => {
    assert.equal(
      MIN_DEPOSIT_RATE_BPS,
      2_000,
    );

    assert.equal(
      MAX_DEPOSIT_RATE_BPS,
      8_000,
    );

    assert.equal(
      MIN_BALANCE_DUE_DAYS_BEFORE_EVENT,
      1,
    );

    assert.equal(
      MAX_BALANCE_DUE_DAYS_BEFORE_EVENT,
      30,
    );

    assert.equal(
      isAllowedDepositRateBps(
        2_000,
      ),
      true,
    );

    assert.equal(
      isAllowedDepositRateBps(
        8_000,
      ),
      true,
    );

    assert.equal(
      isAllowedDepositRateBps(
        1_999,
      ),
      false,
    );

    assert.equal(
      isAllowedDepositRateBps(
        8_001,
      ),
      false,
    );

    assert.equal(
      isAllowedBalanceDueDays(
        1,
      ),
      true,
    );

    assert.equal(
      isAllowedBalanceDueDays(
        30,
      ),
      true,
    );

    assert.equal(
      isAllowedBalanceDueDays(
        0,
      ),
      false,
    );

    assert.equal(
      isAllowedBalanceDueDays(
        31,
      ),
      false,
    );
  },
);

test(
  "money and percentage helpers use integer centavos and basis points",
  () => {
    assert.equal(
      pesosToCentavos(
        30_000,
      ),
      3_000_000,
    );

    assert.equal(
      pesosToCentavos(
        99.99,
      ),
      9_999,
    );

    assert.equal(
      pesosToCentavos(
        -1,
      ),
      null,
    );

    assert.equal(
      centavosToPesos(
        3_000_000,
      ),
      30_000,
    );

    assert.equal(
      percentageToBasisPoints(
        10,
      ),
      1_000,
    );

    assert.equal(
      percentageToBasisPoints(
        12,
      ),
      1_200,
    );

    assert.equal(
      percentageToBasisPoints(
        20,
      ),
      2_000,
    );

    assert.equal(
      percentageToBasisPoints(
        80,
      ),
      8_000,
    );

    assert.equal(
      percentageToBasisPoints(
        100,
      ),
      BASIS_POINTS_SCALE,
    );

    assert.equal(
      percentageToBasisPoints(
        101,
      ),
      null,
    );

    assert.equal(
      basisPointsToPercentage(
        1_000,
      ),
      10,
    );
  },
);

test(
  "P0 defaults model 10 percent commission and 12 percent VAT",
  () => {
    assert.equal(
      DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
      1_000,
    );

    assert.equal(
      DEFAULT_PLATFORM_VAT_RATE_BPS,
      1_200,
    );

    assert.equal(
      applyBasisPoints(
        3_000_000,
        1_000,
      ),
      300_000,
    );

    assert.equal(
      applyBasisPoints(
        300_000,
        1_200,
      ),
      36_000,
    );
  },
);

test(
  "deposit plus balance commission equals one full-payment commission",
  () => {
    const depositCommission =
      allocateCumulativeBasisPoints({
        currentBaseInCentavos:
          900_000,
        cumulativeBaseBeforeInCentavos:
          0,
        alreadyAllocatedInCentavos:
          0,
        rateBps:
          1_000,
      });

    assert.equal(
      depositCommission,
      90_000,
    );

    const balanceCommission =
      allocateCumulativeBasisPoints({
        currentBaseInCentavos:
          2_100_000,
        cumulativeBaseBeforeInCentavos:
          900_000,
        alreadyAllocatedInCentavos:
          depositCommission,
        rateBps:
          1_000,
      });

    assert.equal(
      balanceCommission,
      210_000,
    );

    assert.equal(
      depositCommission +
        balanceCommission,
      applyBasisPoints(
        3_000_000,
        1_000,
      ),
    );
  },
);

test(
  "VAT allocation reconciles across split commission collection",
  () => {
    const firstVat =
      allocateCumulativeBasisPoints({
        currentBaseInCentavos:
          90_000,
        cumulativeBaseBeforeInCentavos:
          0,
        alreadyAllocatedInCentavos:
          0,
        rateBps:
          1_200,
      });

    assert.equal(
      firstVat,
      10_800,
    );

    const secondVat =
      allocateCumulativeBasisPoints({
        currentBaseInCentavos:
          210_000,
        cumulativeBaseBeforeInCentavos:
          90_000,
        alreadyAllocatedInCentavos:
          firstVat,
        rateBps:
          1_200,
      });

    assert.equal(
      secondVat,
      25_200,
    );

    assert.equal(
      firstVat +
        secondVat,
      applyBasisPoints(
        300_000,
        1_200,
      ),
    );
  },
);

test(
  "cumulative allocation resolves centavo rounding exactly",
  () => {
    const first =
      allocateCumulativeBasisPoints({
        currentBaseInCentavos:
          50,
        cumulativeBaseBeforeInCentavos:
          0,
        alreadyAllocatedInCentavos:
          0,
        rateBps:
          3_333,
      });

    const second =
      allocateCumulativeBasisPoints({
        currentBaseInCentavos:
          51,
        cumulativeBaseBeforeInCentavos:
          50,
        alreadyAllocatedInCentavos:
          first,
        rateBps:
          3_333,
      });

    assert.equal(
      first + second,
      applyBasisPoints(
        101,
        3_333,
      ),
    );
  },
);
