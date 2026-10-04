import {
  allocateCumulativeProportionalReversal,
  buildSuccessfulPaymentFinancialAllocation,
  FINANCIAL_LEDGER_SCHEMA_VERSION,
} from "./financial-ledger-domain.js";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

type PaymentChoice =
  | "minimum"
  | "full"
  | "remaining_balance";

export type SuccessfulPaymentFinancialLedgerPlan = {
  ledgerEntryId: string;

  providerRequestUpdate:
    Record<string, unknown>;

  paymentUpdate:
    Record<string, unknown>;

  ledgerRecord:
    Record<string, unknown>;
};

export function buildSuccessfulPaymentFinancialLedgerPlan(
  input: {
    paymentId: string;
    mainEventId: string;
    providerRequestId: string;
    providerId: string;
    customerId: string;

    paymentChoice: unknown;

    paymentAmountInCentavos:
      number;

    providerRequest:
      UnknownRecord;

    webhookEventId:
      string;

    timestamp:
      unknown;
  },
): SuccessfulPaymentFinancialLedgerPlan {
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

  const webhookEventId =
    requireId(
      input.webhookEventId,
      "Webhook event",
    );

  const paymentChoice =
    requirePaymentChoice(
      input.paymentChoice,
    );

  const allocation =
    buildSuccessfulPaymentFinancialAllocation({
      providerRequest:
        input.providerRequest,

      paymentAmountInCentavos:
        input.paymentAmountInCentavos,
    });

  return {
    ledgerEntryId:
      paymentId,

    providerRequestUpdate: {
      financialLedgerSchemaVersion:
        FINANCIAL_LEDGER_SCHEMA_VERSION,

      commissionAccruedInCentavos:
        allocation
          .commissionAccruedAfterInCentavos,

      commissionReversedInCentavos:
        allocation
          .commissionReversedInCentavos,

      commissionEarnedInCentavos:
        allocation
          .commissionEarnedAfterInCentavos,

      providerVatAccruedInCentavos:
        allocation
          .providerVatAccruedAfterInCentavos,

      platformVatAccruedInCentavos:
        allocation
          .platformVatAccruedAfterInCentavos,

      withholdingAccruedInCentavos:
        allocation
          .withholdingAccruedInCentavos,

      financialLedgerUpdatedAt:
        input.timestamp,
    },

    paymentUpdate: {
      financialLedgerSchemaVersion:
        FINANCIAL_LEDGER_SCHEMA_VERSION,

      financialLedgerEntryId:
        paymentId,

      commissionAccruedInCentavos:
        allocation
          .commissionAccruedForPaymentInCentavos,

      providerVatComponentInCentavos:
        allocation
          .providerVatForPaymentInCentavos,

      platformVatInCentavos:
        allocation
          .platformVatForPaymentInCentavos,

      withholdingInCentavos:
        allocation
          .withholdingForPaymentInCentavos,
    },

    ledgerRecord: {
      schemaVersion:
        FINANCIAL_LEDGER_SCHEMA_VERSION,

      entryType:
        "payment_settled",

      ledgerEntryId:
        paymentId,

      paymentId,
      mainEventId,
      providerRequestId,
      providerId,
      customerId,
      paymentChoice,

      currency:
        allocation.currency,

      grossAmountInCentavos:
        allocation
          .grossForPaymentInCentavos,

      grossSettledBeforeInCentavos:
        allocation
          .grossSettledBeforeInCentavos,

      grossSettledAfterInCentavos:
        allocation
          .grossSettledAfterInCentavos,

      commissionAccruedInCentavos:
        allocation
          .commissionAccruedForPaymentInCentavos,

      commissionAccruedAfterInCentavos:
        allocation
          .commissionAccruedAfterInCentavos,

      commissionReversedAfterInCentavos:
        allocation
          .commissionReversedInCentavos,

      commissionEarnedAfterInCentavos:
        allocation
          .commissionEarnedAfterInCentavos,

      providerVatInCentavos:
        allocation
          .providerVatForPaymentInCentavos,

      providerVatAccruedAfterInCentavos:
        allocation
          .providerVatAccruedAfterInCentavos,

      platformVatInCentavos:
        allocation
          .platformVatForPaymentInCentavos,

      platformVatAccruedAfterInCentavos:
        allocation
          .platformVatAccruedAfterInCentavos,

      withholdingInCentavos:
        allocation
          .withholdingForPaymentInCentavos,

      withholdingAccruedAfterInCentavos:
        allocation
          .withholdingAccruedInCentavos,

      calculationSnapshot:
        allocation
          .calculationSnapshot,

      source:
        "paymongo_webhook",

      webhookEventId,

      createdAt:
        input.timestamp,
    },
  };
}

function requirePaymentChoice(
  value: unknown,
): PaymentChoice {
  if (
    value === "minimum" ||
    value === "full" ||
    value === "remaining_balance"
  ) {
    return value;
  }

  throw new Error(
    "Financial ledger payment choice is invalid.",
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
    throw new Error(
      `${label} financial-ledger identity is invalid.`,
    );
  }

  return value;
}
export type SuccessfulRefundFinancialLedgerPlan = {
  ledgerEntryId: string;

  providerRequestUpdate:
    Record<string, unknown>;

  paymentUpdate:
    Record<string, unknown>;

  ledgerRecord:
    Record<string, unknown>;
};

export function buildSuccessfulRefundFinancialLedgerPlan(
  input: {
    paymentId:
      string;

    refundOperationId:
      string;

    mainEventId:
      string;

    providerRequestId:
      string;

    providerId:
      string;

    customerId:
      string;

    refundAmountInCentavos:
      number;

    refundedBeforeInCentavos:
      number;

    payment:
      UnknownRecord;

    providerRequest:
      UnknownRecord;

    source:
      "refund_execution_response" |
      "admin_reconciliation" |
      "paymongo_webhook";

    webhookEventId:
      string | null;

    timestamp:
      unknown;
  },
): SuccessfulRefundFinancialLedgerPlan {
  const paymentId =
    requireId(
      input.paymentId,
      "Payment",
    );

  const refundOperationId =
    requireId(
      input.refundOperationId,
      "Refund operation",
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

  if (
    input.payment
      .financialLedgerSchemaVersion !==
      FINANCIAL_LEDGER_SCHEMA_VERSION ||
    input.payment
      .financialLedgerEntryId !==
      paymentId ||
    input.providerRequest
      .financialLedgerSchemaVersion !==
      FINANCIAL_LEDGER_SCHEMA_VERSION
  ) {
    throw new Error(
      "Financial refund ledger linkage is invalid.",
    );
  }

  const originalAmount =
    ledgerPositiveInteger(
      input.payment
        .amountInCentavos,
      "Original payment amount",
    );

  const refundAmount =
    ledgerPositiveInteger(
      input.refundAmountInCentavos,
      "Refund amount",
    );

  const refundBefore =
    ledgerNonNegativeInteger(
      input.refundedBeforeInCentavos,
      "Previous refunded amount",
    );

  const commissionTotal =
    ledgerNonNegativeInteger(
      input.payment
        .commissionAccruedInCentavos,
      "Payment commission",
    );

  const providerVatTotal =
    ledgerNonNegativeInteger(
      input.payment
        .providerVatComponentInCentavos,
      "Payment provider VAT",
    );

  const platformVatTotal =
    ledgerNonNegativeInteger(
      input.payment
        .platformVatInCentavos,
      "Payment platform VAT",
    );

  const withholdingTotal =
    ledgerNonNegativeInteger(
      input.payment
        .withholdingInCentavos,
      "Payment withholding",
    );

  if (withholdingTotal !== 0) {
    throw new Error(
      "Automatic withholding reversal is not enabled.",
    );
  }

  const commission =
    allocateCumulativeProportionalReversal({
      totalComponentInCentavos:
        commissionTotal,

      originalAmountInCentavos:
        originalAmount,

      cumulativeRefundBeforeInCentavos:
        refundBefore,

      currentRefundInCentavos:
        refundAmount,

      alreadyReversedInCentavos:
        ledgerOptionalNonNegativeInteger(
          input.payment
            .commissionReversedInCentavos,
          0,
          "Payment commission reversed",
        ),
    });

  const providerVat =
    allocateCumulativeProportionalReversal({
      totalComponentInCentavos:
        providerVatTotal,

      originalAmountInCentavos:
        originalAmount,

      cumulativeRefundBeforeInCentavos:
        refundBefore,

      currentRefundInCentavos:
        refundAmount,

      alreadyReversedInCentavos:
        ledgerOptionalNonNegativeInteger(
          input.payment
            .providerVatReversedInCentavos,
          0,
          "Payment provider VAT reversed",
        ),
    });

  const platformVat =
    allocateCumulativeProportionalReversal({
      totalComponentInCentavos:
        platformVatTotal,

      originalAmountInCentavos:
        originalAmount,

      cumulativeRefundBeforeInCentavos:
        refundBefore,

      currentRefundInCentavos:
        refundAmount,

      alreadyReversedInCentavos:
        ledgerOptionalNonNegativeInteger(
          input.payment
            .platformVatReversedInCentavos,
          0,
          "Payment platform VAT reversed",
        ),
    });

  const withholding =
    allocateCumulativeProportionalReversal({
      totalComponentInCentavos:
        0,

      originalAmountInCentavos:
        originalAmount,

      cumulativeRefundBeforeInCentavos:
        refundBefore,

      currentRefundInCentavos:
        refundAmount,

      alreadyReversedInCentavos:
        ledgerOptionalNonNegativeInteger(
          input.payment
            .withholdingReversedInCentavos,
          0,
          "Payment withholding reversed",
        ),
    });

  const requestCommissionAccrued =
    ledgerNonNegativeInteger(
      input.providerRequest
        .commissionAccruedInCentavos,
      "Request commission accrued",
    );

  const requestCommissionReversedBefore =
    ledgerOptionalNonNegativeInteger(
      input.providerRequest
        .commissionReversedInCentavos,
      0,
      "Request commission reversed",
    );

  const requestCommissionReversedAfter =
    checkedLedgerAdd(
      requestCommissionReversedBefore,
      commission
        .reversalForCurrentInCentavos,
    );

  if (
    requestCommissionReversedAfter >
      requestCommissionAccrued
  ) {
    throw new Error(
      "Financial refund commission reversal exceeds accrued commission.",
    );
  }

  const requestProviderVatAccrued =
    ledgerNonNegativeInteger(
      input.providerRequest
        .providerVatAccruedInCentavos,
      "Request provider VAT accrued",
    );

  const requestProviderVatReversedAfter =
    checkedLedgerAdd(
      ledgerOptionalNonNegativeInteger(
        input.providerRequest
          .providerVatReversedInCentavos,
        0,
        "Request provider VAT reversed",
      ),

      providerVat
        .reversalForCurrentInCentavos,
    );

  if (
    requestProviderVatReversedAfter >
      requestProviderVatAccrued
  ) {
    throw new Error(
      "Financial refund provider VAT reversal exceeds accrued VAT.",
    );
  }

  const requestPlatformVatAccrued =
    ledgerNonNegativeInteger(
      input.providerRequest
        .platformVatAccruedInCentavos,
      "Request platform VAT accrued",
    );

  const requestPlatformVatReversedAfter =
    checkedLedgerAdd(
      ledgerOptionalNonNegativeInteger(
        input.providerRequest
          .platformVatReversedInCentavos,
        0,
        "Request platform VAT reversed",
      ),

      platformVat
        .reversalForCurrentInCentavos,
    );

  if (
    requestPlatformVatReversedAfter >
      requestPlatformVatAccrued
  ) {
    throw new Error(
      "Financial refund platform VAT reversal exceeds accrued VAT.",
    );
  }

  const requestWithholdingAccrued =
    ledgerOptionalNonNegativeInteger(
      input.providerRequest
        .withholdingAccruedInCentavos,
      0,
      "Request withholding accrued",
    );

  const requestWithholdingReversedAfter =
    checkedLedgerAdd(
      ledgerOptionalNonNegativeInteger(
        input.providerRequest
          .withholdingReversedInCentavos,
        0,
        "Request withholding reversed",
      ),

      withholding
        .reversalForCurrentInCentavos,
    );

  if (
    requestWithholdingAccrued !== 0 ||
    requestWithholdingReversedAfter !== 0
  ) {
    throw new Error(
      "Automatic withholding accounting is not enabled.",
    );
  }

  const refundedAfter =
    checkedLedgerAdd(
      refundBefore,
      refundAmount,
    );

  if (
    refundedAfter >
      originalAmount
  ) {
    throw new Error(
      "Financial refund exceeds the original payment.",
    );
  }

  const ledgerEntryId =
    requireId(
      `refund_${refundOperationId}`,
      "Financial refund ledger",
    );

  return {
    ledgerEntryId,

    paymentUpdate: {
      commissionReversedInCentavos:
        commission
          .reversedAfterInCentavos,

      providerVatReversedInCentavos:
        providerVat
          .reversedAfterInCentavos,

      platformVatReversedInCentavos:
        platformVat
          .reversedAfterInCentavos,

      withholdingReversedInCentavos:
        0,

      lastFinancialReversalLedgerEntryId:
        ledgerEntryId,
    },

    providerRequestUpdate: {
      commissionReversedInCentavos:
        requestCommissionReversedAfter,

      commissionEarnedInCentavos:
        requestCommissionAccrued -
        requestCommissionReversedAfter,

      providerVatReversedInCentavos:
        requestProviderVatReversedAfter,

      providerVatNetInCentavos:
        requestProviderVatAccrued -
        requestProviderVatReversedAfter,

      platformVatReversedInCentavos:
        requestPlatformVatReversedAfter,

      platformVatNetInCentavos:
        requestPlatformVatAccrued -
        requestPlatformVatReversedAfter,

      withholdingReversedInCentavos:
        0,

      withholdingNetInCentavos:
        0,

      financialLedgerUpdatedAt:
        input.timestamp,
    },

    ledgerRecord: {
      schemaVersion:
        FINANCIAL_LEDGER_SCHEMA_VERSION,

      entryType:
        "refund_completed",

      ledgerEntryId,

      paymentId,

      originalPaymentLedgerEntryId:
        paymentId,

      refundOperationId,

      mainEventId,

      providerRequestId,

      providerId,

      customerId,

      currency:
        "PHP",

      refundAmountInCentavos:
        refundAmount,

      refundedBeforeInCentavos:
        refundBefore,

      refundedAfterInCentavos:
        refundedAfter,

      commissionReversedInCentavos:
        commission
          .reversalForCurrentInCentavos,

      commissionReversedAfterInCentavos:
        requestCommissionReversedAfter,

      commissionEarnedAfterInCentavos:
        requestCommissionAccrued -
        requestCommissionReversedAfter,

      providerVatReversedInCentavos:
        providerVat
          .reversalForCurrentInCentavos,

      providerVatReversedAfterInCentavos:
        requestProviderVatReversedAfter,

      platformVatReversedInCentavos:
        platformVat
          .reversalForCurrentInCentavos,

      platformVatReversedAfterInCentavos:
        requestPlatformVatReversedAfter,

      withholdingReversedInCentavos:
        0,

      calculationSnapshot: {
        schemaVersion: 1,

        reversalPolicy:
          "proportional_to_completed_refund_v1",

        originalPaymentAmountInCentavos:
          originalAmount,

        originalCommissionInCentavos:
          commissionTotal,

        originalProviderVatInCentavos:
          providerVatTotal,

        originalPlatformVatInCentavos:
          platformVatTotal,

        originalWithholdingInCentavos:
          0,
      },

      source:
        input.source,

      webhookEventId:
        input.webhookEventId,

      createdAt:
        input.timestamp,
    },
  };
}

function ledgerPositiveInteger(
  value: unknown,
  label: string,
): number {
  const parsed =
    ledgerNonNegativeInteger(
      value,
      label,
    );

  if (parsed === 0) {
    throw new Error(
      `${label} must be greater than zero.`,
    );
  }

  return parsed;
}

function ledgerOptionalNonNegativeInteger(
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

  return ledgerNonNegativeInteger(
    value,
    label,
  );
}

function ledgerNonNegativeInteger(
  value: unknown,
  label: string,
): number {
  if (
    Number.isSafeInteger(value) &&
    (value as number) >= 0
  ) {
    return value as number;
  }

  throw new Error(
    `${label} is invalid.`,
  );
}

function checkedLedgerAdd(
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
    throw new Error(
      "Financial ledger amount exceeds the safe integer range.",
    );
  }

  return result;
}
