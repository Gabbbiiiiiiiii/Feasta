const BASIS_POINTS_SCALE = 10_000;

export const FINANCIAL_LEDGER_SCHEMA_VERSION = 1;

/*
 * Capstone provider-VAT default.
 *
 * Provider VAT is treated as a component already contained
 * in the provider's gross service price. It is never added
 * again to the customer's authoritative booking amount.
 */
export const DEFAULT_PROVIDER_VAT_RATE_BPS = 1_200;

export const COMMISSION_BASE_POLICY =
  "gross_collected_v1" as const;

export const PROVIDER_VAT_POLICY =
  "vat_inclusive_component_v1" as const;

export const PLATFORM_VAT_POLICY =
  "commission_vat_v1" as const;

export const WITHHOLDING_POLICY =
  "not_applied_v1" as const;

type UnknownRecord =
  Readonly<Record<string, unknown>>;

type TaxRegistrationStatus =
  | "non_vat"
  | "vat_registered";

type ProviderTaxVerificationStatus =
  | "pending"
  | "verified"
  | "rejected";

type FinancialSnapshot = {
  schemaVersion: 1;
  currency: "PHP";

  grossAmountInCentavos: number;

  platformCommissionRateBps: number;

  platformTaxStatus:
    TaxRegistrationStatus;

  platformVatRateBps: number;

  financialPolicyVersion: number;

  providerTaxType:
    TaxRegistrationStatus | null;

  providerTaxVerificationStatus:
    ProviderTaxVerificationStatus | null;
};

export type SuccessfulPaymentFinancialAllocation = {
  schemaVersion: 1;
  currency: "PHP";

  grossForPaymentInCentavos: number;

  grossSettledBeforeInCentavos: number;

  grossSettledAfterInCentavos: number;

  commissionRateBps: number;

  commissionAccruedForPaymentInCentavos:
    number;

  commissionAccruedBeforeInCentavos:
    number;

  commissionAccruedAfterInCentavos:
    number;

  commissionReversedInCentavos:
    number;

  commissionEarnedAfterInCentavos:
    number;

  providerVatApplicable: boolean;

  providerVatRateBps: number;

  providerVatForPaymentInCentavos:
    number;

  providerVatAccruedBeforeInCentavos:
    number;

  providerVatAccruedAfterInCentavos:
    number;

  platformVatApplicable: boolean;

  platformVatRateBps: number;

  platformVatForPaymentInCentavos:
    number;

  platformVatAccruedBeforeInCentavos:
    number;

  platformVatAccruedAfterInCentavos:
    number;

  withholdingStatus: "not_applied";

  withholdingForPaymentInCentavos:
    0;

  withholdingAccruedInCentavos:
    0;

  calculationSnapshot: {
    schemaVersion: 1;

    financialPolicyVersion:
      number;

    commissionBasePolicy:
      typeof COMMISSION_BASE_POLICY;

    providerVatPolicy:
      typeof PROVIDER_VAT_POLICY;

    platformVatPolicy:
      typeof PLATFORM_VAT_POLICY;

    withholdingPolicy:
      typeof WITHHOLDING_POLICY;

    providerTaxType:
      TaxRegistrationStatus | null;

    providerTaxVerificationStatus:
      ProviderTaxVerificationStatus | null;

    platformTaxStatus:
      TaxRegistrationStatus;

    commissionRateBps:
      number;

    providerVatRateBps:
      number;

    platformVatRateBps:
      number;
  };
};

export function buildSuccessfulPaymentFinancialAllocation(
  input: {
    providerRequest:
      UnknownRecord;

    paymentAmountInCentavos:
      number;
  },
): SuccessfulPaymentFinancialAllocation {
  const financial =
    requireFinancialSnapshot(
      input.providerRequest
        .financialSnapshot,
    );

  const paymentAmount =
    positiveSafeInteger(
      input.paymentAmountInCentavos,
      "Payment amount",
    );

  const settledBefore =
    optionalNonNegativeSafeInteger(
      input.providerRequest
        .grossSettledAmountInCentavos,
      0,
      "Gross settled amount",
    );

  const settledAfter =
    settledBefore +
    paymentAmount;

  if (
    !Number.isSafeInteger(
      settledAfter,
    ) ||
    settledAfter >
      financial
        .grossAmountInCentavos
  ) {
    throw financialAllocationInvalid(
      "Payment settlement exceeds the provider-request gross amount.",
    );
  }

  const commissionBefore =
    applyBasisPoints(
      settledBefore,
      financial
        .platformCommissionRateBps,
    );

  const commissionAfter =
    applyBasisPoints(
      settledAfter,
      financial
        .platformCommissionRateBps,
    );

  const commissionForPayment =
    commissionAfter -
    commissionBefore;

  const commissionReversed =
    optionalNonNegativeSafeInteger(
      input.providerRequest
        .commissionReversedInCentavos,
      0,
      "Commission reversed amount",
    );

  if (
    commissionReversed >
      commissionAfter
  ) {
    throw financialAllocationInvalid(
      "Commission reversal exceeds accrued commission.",
    );
  }

  const commissionEarnedAfter =
    commissionAfter -
    commissionReversed;

  const providerVatApplicable =
    financial
      .providerTaxVerificationStatus ===
        "verified" &&
    financial.providerTaxType ===
      "vat_registered";

  const providerVatRateBps =
    providerVatApplicable
      ? DEFAULT_PROVIDER_VAT_RATE_BPS
      : 0;

  const providerVatBefore =
    providerVatApplicable
      ? inclusiveTaxComponent(
          settledBefore,
          providerVatRateBps,
        )
      : 0;

  const providerVatAfter =
    providerVatApplicable
      ? inclusiveTaxComponent(
          settledAfter,
          providerVatRateBps,
        )
      : 0;

  const providerVatForPayment =
    providerVatAfter -
    providerVatBefore;

  const platformVatApplicable =
    financial.platformTaxStatus ===
      "vat_registered";

  const platformVatBefore =
    platformVatApplicable
      ? applyBasisPoints(
          commissionBefore,
          financial
            .platformVatRateBps,
        )
      : 0;

  const platformVatAfter =
    platformVatApplicable
      ? applyBasisPoints(
          commissionAfter,
          financial
            .platformVatRateBps,
        )
      : 0;

  const platformVatForPayment =
    platformVatAfter -
    platformVatBefore;

  return {
    schemaVersion:
      FINANCIAL_LEDGER_SCHEMA_VERSION,

    currency: "PHP",

    grossForPaymentInCentavos:
      paymentAmount,

    grossSettledBeforeInCentavos:
      settledBefore,

    grossSettledAfterInCentavos:
      settledAfter,

    commissionRateBps:
      financial
        .platformCommissionRateBps,

    commissionAccruedForPaymentInCentavos:
      commissionForPayment,

    commissionAccruedBeforeInCentavos:
      commissionBefore,

    commissionAccruedAfterInCentavos:
      commissionAfter,

    commissionReversedInCentavos:
      commissionReversed,

    commissionEarnedAfterInCentavos:
      commissionEarnedAfter,

    providerVatApplicable,

    providerVatRateBps,

    providerVatForPaymentInCentavos:
      providerVatForPayment,

    providerVatAccruedBeforeInCentavos:
      providerVatBefore,

    providerVatAccruedAfterInCentavos:
      providerVatAfter,

    platformVatApplicable,

    platformVatRateBps:
      platformVatApplicable
        ? financial
            .platformVatRateBps
        : 0,

    platformVatForPaymentInCentavos:
      platformVatForPayment,

    platformVatAccruedBeforeInCentavos:
      platformVatBefore,

    platformVatAccruedAfterInCentavos:
      platformVatAfter,

    withholdingStatus:
      "not_applied",

    withholdingForPaymentInCentavos:
      0,

    withholdingAccruedInCentavos:
      0,

    calculationSnapshot: {
      schemaVersion: 1,

      financialPolicyVersion:
        financial
          .financialPolicyVersion,

      commissionBasePolicy:
        COMMISSION_BASE_POLICY,

      providerVatPolicy:
        PROVIDER_VAT_POLICY,

      platformVatPolicy:
        PLATFORM_VAT_POLICY,

      withholdingPolicy:
        WITHHOLDING_POLICY,

      providerTaxType:
        financial.providerTaxType,

      providerTaxVerificationStatus:
        financial
          .providerTaxVerificationStatus,

      platformTaxStatus:
        financial
          .platformTaxStatus,

      commissionRateBps:
        financial
          .platformCommissionRateBps,

      providerVatRateBps,

      platformVatRateBps:
        platformVatApplicable
          ? financial
              .platformVatRateBps
          : 0,
    },
  };
}

/*
 * Extracts the tax component from an amount that already
 * includes that tax.
 *
 * Example:
 * VAT component =
 * gross * rate / (100% + rate)
 *
 * Integer half-up rounding keeps calculations deterministic.
 */
export function inclusiveTaxComponent(
  amountInCentavos: number,
  rateBps: number,
): number {
  const amount =
    nonNegativeSafeInteger(
      amountInCentavos,
      "Tax-inclusive amount",
    );

  const rate =
    basisPointRate(
      rateBps,
      "Tax rate",
    );

  if (rate === 0) {
    return 0;
  }

  const denominator =
    BASIS_POINTS_SCALE +
    rate;

  const product =
    amount *
    rate;

  if (
    !Number.isSafeInteger(
      product,
    )
  ) {
    throw financialAllocationInvalid(
      "Tax calculation exceeds the safe integer range.",
    );
  }

  return Math.floor(
    (
      product +
      Math.floor(
        denominator / 2,
      )
    ) /
      denominator,
  );
}

function applyBasisPoints(
  amountInCentavos: number,
  rateBps: number,
): number {
  const amount =
    nonNegativeSafeInteger(
      amountInCentavos,
      "Basis-point amount",
    );

  const rate =
    basisPointRate(
      rateBps,
      "Basis-point rate",
    );

  const product =
    amount *
    rate;

  if (
    !Number.isSafeInteger(
      product,
    )
  ) {
    throw financialAllocationInvalid(
      "Basis-point calculation exceeds the safe integer range.",
    );
  }

  return Math.floor(
    (
      product +
      BASIS_POINTS_SCALE / 2
    ) /
      BASIS_POINTS_SCALE,
  );
}

function requireFinancialSnapshot(
  value: unknown,
): FinancialSnapshot {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw financialAllocationInvalid(
      "Provider-request financial snapshot is missing.",
    );
  }

  const snapshot =
    value as UnknownRecord;

  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.currency !== "PHP"
  ) {
    throw financialAllocationInvalid(
      "Provider-request financial snapshot is unsupported.",
    );
  }

  const providerTaxType =
    optionalTaxStatus(
      snapshot.providerTaxType,
    );

  const providerTaxVerificationStatus =
    optionalProviderTaxVerificationStatus(
      snapshot
        .providerTaxVerificationStatus,
    );

  return {
    schemaVersion: 1,
    currency: "PHP",

    grossAmountInCentavos:
      positiveSafeInteger(
        snapshot
          .grossAmountInCentavos,
        "Financial gross amount",
      ),

    platformCommissionRateBps:
      basisPointRate(
        snapshot
          .platformCommissionRateBps,
        "Platform commission rate",
      ),

    platformTaxStatus:
      requiredTaxStatus(
        snapshot.platformTaxStatus,
        "Platform tax status",
      ),

    platformVatRateBps:
      basisPointRate(
        snapshot
          .platformVatRateBps,
        "Platform VAT rate",
      ),

    financialPolicyVersion:
      positiveSafeInteger(
        snapshot
          .financialPolicyVersion,
        "Financial policy version",
      ),

    providerTaxType,

    providerTaxVerificationStatus,
  };
}

function requiredTaxStatus(
  value: unknown,
  label: string,
): TaxRegistrationStatus {
  if (
    value === "non_vat" ||
    value === "vat_registered"
  ) {
    return value;
  }

  throw financialAllocationInvalid(
    `${label} is invalid.`,
  );
}

function optionalTaxStatus(
  value: unknown,
): TaxRegistrationStatus | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  return requiredTaxStatus(
    value,
    "Provider tax type",
  );
}

function optionalProviderTaxVerificationStatus(
  value: unknown,
): ProviderTaxVerificationStatus | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    value === "pending" ||
    value === "verified" ||
    value === "rejected"
  ) {
    return value;
  }

  throw financialAllocationInvalid(
    "Provider tax verification status is invalid.",
  );
}

function basisPointRate(
  value: unknown,
  label: string,
): number {
  if (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <=
      BASIS_POINTS_SCALE
  ) {
    return value as number;
  }

  throw financialAllocationInvalid(
    `${label} is invalid.`,
  );
}

function positiveSafeInteger(
  value: unknown,
  label: string,
): number {
  const parsed =
    nonNegativeSafeInteger(
      value,
      label,
    );

  if (parsed === 0) {
    throw financialAllocationInvalid(
      `${label} must be greater than zero.`,
    );
  }

  return parsed;
}

function optionalNonNegativeSafeInteger(
  value: unknown,
  fallback: number,
  label: string,
): number {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return nonNegativeSafeInteger(
    value,
    label,
  );
}

function nonNegativeSafeInteger(
  value: unknown,
  label: string,
): number {
  if (
    Number.isSafeInteger(value) &&
    (value as number) >= 0
  ) {
    return value as number;
  }

  throw financialAllocationInvalid(
    `${label} is invalid.`,
  );
}

function financialAllocationInvalid(
  message: string,
): Error {
  return new Error(
    `Financial allocation invalid: ${message}`,
  );
}
export function allocateCumulativeProportionalReversal(
  input: {
    totalComponentInCentavos:
      number;

    originalAmountInCentavos:
      number;

    cumulativeRefundBeforeInCentavos:
      number;

    currentRefundInCentavos:
      number;

    alreadyReversedInCentavos:
      number;
  },
): {
  reversalForCurrentInCentavos:
    number;

  reversedAfterInCentavos:
    number;
} {
  const totalComponent =
    nonNegativeSafeInteger(
      input.totalComponentInCentavos,
      "Reversal component total",
    );

  const originalAmount =
    positiveSafeInteger(
      input.originalAmountInCentavos,
      "Original payment amount",
    );

  const refundBefore =
    nonNegativeSafeInteger(
      input.cumulativeRefundBeforeInCentavos,
      "Previous refunded amount",
    );

  const currentRefund =
    positiveSafeInteger(
      input.currentRefundInCentavos,
      "Current refund amount",
    );

  const alreadyReversed =
    nonNegativeSafeInteger(
      input.alreadyReversedInCentavos,
      "Previously reversed component",
    );

  const refundAfter =
    refundBefore +
    currentRefund;

  if (
    !Number.isSafeInteger(
      refundAfter,
    ) ||
    refundAfter >
      originalAmount
  ) {
    throw financialAllocationInvalid(
      "Cumulative refund exceeds the original payment.",
    );
  }

  const targetBefore =
    proportionalComponent(
      totalComponent,
      refundBefore,
      originalAmount,
    );

  if (
    alreadyReversed !==
      targetBefore
  ) {
    throw financialAllocationInvalid(
      "Stored financial reversal does not match previous refund accounting.",
    );
  }

  const targetAfter =
    proportionalComponent(
      totalComponent,
      refundAfter,
      originalAmount,
    );

  if (
    targetAfter <
      alreadyReversed
  ) {
    throw financialAllocationInvalid(
      "Financial reversal moved backwards.",
    );
  }

  return {
    reversalForCurrentInCentavos:
      targetAfter -
      alreadyReversed,

    reversedAfterInCentavos:
      targetAfter,
  };
}

function proportionalComponent(
  componentInCentavos:
    number,

  refundedAmountInCentavos:
    number,

  originalAmountInCentavos:
    number,
): number {
  const product =
    componentInCentavos *
    refundedAmountInCentavos;

  if (
    !Number.isSafeInteger(
      product,
    )
  ) {
    throw financialAllocationInvalid(
      "Proportional reversal exceeds the safe integer range.",
    );
  }

  return Math.floor(
    (
      product +
      Math.floor(
        originalAmountInCentavos /
          2,
      )
    ) /
      originalAmountInCentavos,
  );
}