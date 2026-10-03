export const PROVIDER_EARNING_SCHEMA_VERSION =
  1 as const;

export const PROVIDER_EARNING_STATUSES = [
  "pending",
  "available",
  "paid",
  "reversed",
] as const;

export type ProviderEarningStatus =
  typeof PROVIDER_EARNING_STATUSES[number];

type UnknownRecord =
  Readonly<Record<string, unknown>>;

export type SuccessfulPaymentProviderEarningPlan = {
  earningId: string;

  paymentUpdate:
    Record<string, unknown>;

  earningRecord:
    Record<string, unknown>;
};

export type ProviderEarningRefundPlan = {
  paymentUpdate:
    Record<string, unknown>;

  earningUpdate:
    Record<string, unknown>;
};

export function providerEarningIdForPayment(
  paymentId: string,
): string {
  return requireId(
    paymentId,
    "Payment",
  );
}

export function buildSuccessfulPaymentProviderEarningPlan(
  input: {
    paymentId: string;
    mainEventId: string;
    providerRequestId: string;
    providerId: string;
    customerId: string;

    financialLedgerRecord:
      UnknownRecord;

    timestamp:
      unknown;
  },
): SuccessfulPaymentProviderEarningPlan {
  const paymentId =
    requireId(
      input.paymentId,
      "Payment",
    );

  const mainEventId =
    requireId(
      input.mainEventId,
      "Main event",
    );

  const providerRequestId =
    requireId(
      input.providerRequestId,
      "Provider request",
    );

  const providerId =
    requireId(
      input.providerId,
      "Provider",
    );

  const customerId =
    requireId(
      input.customerId,
      "Customer",
    );

  const ledger =
    input.financialLedgerRecord;

  if (
    ledger.schemaVersion !== 1 ||
    ledger.entryType !==
      "payment_settled" ||
    ledger.ledgerEntryId !==
      paymentId ||
    ledger.paymentId !==
      paymentId ||
    ledger.mainEventId !==
      mainEventId ||
    ledger.providerRequestId !==
      providerRequestId ||
    ledger.providerId !==
      providerId ||
    ledger.customerId !==
      customerId ||
    ledger.currency !== "PHP"
  ) {
    throw earningInvalid(
      "Successful-payment financial ledger linkage is invalid.",
    );
  }

  const gross =
    positiveInteger(
      ledger.grossAmountInCentavos,
      "Gross collected amount",
    );

  const commission =
    nonNegativeInteger(
      ledger.commissionAccruedInCentavos,
      "Commission amount",
    );

  const withholding =
    nonNegativeInteger(
      ledger.withholdingInCentavos,
      "Withholding amount",
    );

  const providerVat =
    nonNegativeInteger(
      ledger.providerVatInCentavos,
      "Provider VAT component",
    );

  const platformVat =
    nonNegativeInteger(
      ledger.platformVatInCentavos,
      "Platform VAT amount",
    );

  if (
    commission +
      withholding >
    gross
  ) {
    throw earningInvalid(
      "Provider earning deductions exceed the collected amount.",
    );
  }

  /*
   * Provider VAT is already contained in the provider's
   * service gross and therefore remains part of provider
   * earnings.
   *
   * Platform VAT belongs to FEASTA's commission-side
   * accounting and is not another Provider deduction.
   */
  const earningAmount =
    gross -
    commission -
    withholding;

  const earningId =
    providerEarningIdForPayment(
      paymentId,
    );

  return {
    earningId,

    paymentUpdate: {
      providerEarningSchemaVersion:
        PROVIDER_EARNING_SCHEMA_VERSION,

      providerEarningId:
        earningId,

      providerEarningStatus:
        "pending",

      providerEarningAmountInCentavos:
        earningAmount,

      providerEarningReversedInCentavos:
        0,
    },

    earningRecord: {
      schemaVersion:
        PROVIDER_EARNING_SCHEMA_VERSION,

      earningId,

      status:
        "pending",

      providerId,
      providerRequestId,
      mainEventId,
      customerId,
      paymentId,

      currency:
        "PHP",

      grossCollectedInCentavos:
        gross,

      commissionDeductedInCentavos:
        commission,

      withholdingDeductedInCentavos:
        withholding,

      /*
       * Informational tax components.
       * Neither field is silently deducted here.
       */
      providerVatComponentInCentavos:
        providerVat,

      platformVatOnCommissionInCentavos:
        platformVat,

      earningAmountInCentavos:
        earningAmount,

      pendingAmountInCentavos:
        earningAmount,

      availableAmountInCentavos:
        0,

      paidAmountInCentavos:
        0,

      reversedAmountInCentavos:
        0,

      netEarningAmountInCentavos:
        earningAmount,

      sourceFinancialLedgerEntryId:
        paymentId,

      createdAt:
        input.timestamp,

      updatedAt:
        input.timestamp,
    },
  };
}

export function buildProviderEarningRefundPlan(
  input: {
    paymentId: string;
    earningId: string;

    earning:
      UnknownRecord;

    refundFinancialLedgerRecord:
      UnknownRecord;

    timestamp:
      unknown;
  },
): ProviderEarningRefundPlan {
  const paymentId =
    requireId(
      input.paymentId,
      "Payment",
    );

  const earningId =
    requireId(
      input.earningId,
      "Provider earning",
    );

  const earning =
    input.earning;

  if (
    earning.schemaVersion !==
      PROVIDER_EARNING_SCHEMA_VERSION ||
    earning.earningId !==
      earningId ||
    earning.paymentId !==
      paymentId ||
    earning.currency !==
      "PHP"
  ) {
    throw earningInvalid(
      "Provider earning linkage is invalid.",
    );
  }

  const currentStatus =
    requireProviderEarningStatus(
      earning.status,
    );

  const earningAmount =
    nonNegativeInteger(
      earning.earningAmountInCentavos,
      "Provider earning amount",
    );

  const pendingBefore =
    nonNegativeInteger(
      earning.pendingAmountInCentavos,
      "Pending earning amount",
    );

  const availableBefore =
    nonNegativeInteger(
      earning.availableAmountInCentavos,
      "Available earning amount",
    );

  const paidBefore =
    nonNegativeInteger(
      earning.paidAmountInCentavos,
      "Paid earning amount",
    );

  const reversedBefore =
    nonNegativeInteger(
      earning.reversedAmountInCentavos,
      "Reversed earning amount",
    );

  if (
    checkedAdd(
      checkedAdd(
        pendingBefore,
        availableBefore,
      ),
      checkedAdd(
        paidBefore,
        reversedBefore,
      ),
    ) !==
    earningAmount
  ) {
    throw earningInvalid(
      "Provider earning buckets do not reconcile.",
    );
  }

  const refundLedger =
    input.refundFinancialLedgerRecord;

  if (
    refundLedger.schemaVersion !== 1 ||
    refundLedger.entryType !==
      "refund_completed" ||
    refundLedger.paymentId !==
      paymentId ||
    refundLedger.currency !==
      "PHP"
  ) {
    throw earningInvalid(
      "Refund financial ledger linkage is invalid.",
    );
  }

  const refundLedgerEntryId =
    requireId(
      refundLedger.ledgerEntryId,
      "Refund financial ledger",
    );

  const refundAmount =
    positiveInteger(
      refundLedger.refundAmountInCentavos,
      "Completed refund amount",
    );

  const commissionReversed =
    nonNegativeInteger(
      refundLedger.commissionReversedInCentavos,
      "Commission reversal",
    );

  const withholdingReversed =
    nonNegativeInteger(
      refundLedger.withholdingReversedInCentavos,
      "Withholding reversal",
    );

  if (
    commissionReversed +
      withholdingReversed >
    refundAmount
  ) {
    throw earningInvalid(
      "Provider earning refund deductions exceed the refund amount.",
    );
  }

  /*
   * Undo only the provider's economic share:
   *
   * customer refund
   * - commission returned by FEASTA
   * - withholding returned
   * = provider earning reversal
   */
  const earningReversal =
    refundAmount -
    commissionReversed -
    withholdingReversed;

  const reversibleUnpaid =
    checkedAdd(
      pendingBefore,
      availableBefore,
    );

  /*
   * P9 does not yet perform payout reconciliation.
   * Once money is actually paid out, P10/P12 must
   * handle recovery/offset accounting rather than
   * silently rewriting paid settlement history.
   */
  if (
    earningReversal >
      reversibleUnpaid
  ) {
    throw earningInvalid(
      "Refund touches paid Provider earnings and requires payout reconciliation.",
    );
  }

  const pendingReduction =
    Math.min(
      pendingBefore,
      earningReversal,
    );

  const remainingAfterPending =
    earningReversal -
    pendingReduction;

  const availableReduction =
    Math.min(
      availableBefore,
      remainingAfterPending,
    );

  const pendingAfter =
    pendingBefore -
    pendingReduction;

  const availableAfter =
    availableBefore -
    availableReduction;

  const reversedAfter =
    checkedAdd(
      reversedBefore,
      earningReversal,
    );

  if (
    reversedAfter >
      earningAmount
  ) {
    throw earningInvalid(
      "Provider earning reversal exceeds the original earning.",
    );
  }

  const netAfter =
    earningAmount -
    reversedAfter;

  const status =
    providerEarningStatusAfterRefund({
      currentStatus,
      pendingAmountInCentavos:
        pendingAfter,
      availableAmountInCentavos:
        availableAfter,
      paidAmountInCentavos:
        paidBefore,
      netEarningAmountInCentavos:
        netAfter,
    });

  return {
    paymentUpdate: {
      providerEarningStatus:
        status,

      providerEarningReversedInCentavos:
        reversedAfter,

      providerEarningNetAmountInCentavos:
        netAfter,

      lastProviderEarningReversalLedgerEntryId:
        refundLedgerEntryId,
    },

    earningUpdate: {
      status,

      pendingAmountInCentavos:
        pendingAfter,

      availableAmountInCentavos:
        availableAfter,

      paidAmountInCentavos:
        paidBefore,

      reversedAmountInCentavos:
        reversedAfter,

      netEarningAmountInCentavos:
        netAfter,

      lastReversalFinancialLedgerEntryId:
        refundLedgerEntryId,

      updatedAt:
        input.timestamp,
    },
  };
}

function providerEarningStatusAfterRefund(
  input: {
    currentStatus:
      ProviderEarningStatus;

    pendingAmountInCentavos:
      number;

    availableAmountInCentavos:
      number;

    paidAmountInCentavos:
      number;

    netEarningAmountInCentavos:
      number;
  },
): ProviderEarningStatus {
  if (
    input.netEarningAmountInCentavos ===
      0 &&
    input.paidAmountInCentavos ===
      0
  ) {
    return "reversed";
  }

  if (
    input.paidAmountInCentavos >
      0
  ) {
    return "paid";
  }

  if (
    input.availableAmountInCentavos >
      0
  ) {
    return "available";
  }

  if (
    input.pendingAmountInCentavos >
      0
  ) {
    return "pending";
  }

  return input.currentStatus;
}

function requireProviderEarningStatus(
  value: unknown,
): ProviderEarningStatus {
  if (
    value === "pending" ||
    value === "available" ||
    value === "paid" ||
    value === "reversed"
  ) {
    return value;
  }

  throw earningInvalid(
    "Provider earning status is invalid.",
  );
}

function requireId(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9:_-]{1,220}$/u
      .test(value)
  ) {
    throw earningInvalid(
      `${label} identity is invalid.`,
    );
  }

  return value;
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  const parsed =
    nonNegativeInteger(
      value,
      label,
    );

  if (parsed === 0) {
    throw earningInvalid(
      `${label} must be greater than zero.`,
    );
  }

  return parsed;
}

function nonNegativeInteger(
  value: unknown,
  label: string,
): number {
  if (
    Number.isSafeInteger(value) &&
    (value as number) >= 0
  ) {
    return value as number;
  }

  throw earningInvalid(
    `${label} is invalid.`,
  );
}

function checkedAdd(
  left: number,
  right: number,
): number {
  const result =
    left + right;

  if (
    !Number.isSafeInteger(
      result,
    )
  ) {
    throw earningInvalid(
      "Provider earning amount exceeds the safe integer range.",
    );
  }

  return result;
}

function earningInvalid(
  message: string,
): Error {
  return new Error(
    `Provider earning invalid: ${message}`,
  );
}