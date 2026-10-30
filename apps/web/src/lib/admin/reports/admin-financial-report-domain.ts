import type {
  AdminFinancialLedgerRow,
  AdminFinancialLedgerSummary,
  AdminGatewayFeeEvidenceRow,
  AdminGatewayFeeEvidenceSummary,
  AdminProviderEarningPeriodRow,
  AdminProviderEarningPeriodSummary,
  AdminSettlementPayoutRow,
  AdminSettlementPayoutSummary,
} from "./admin-financial-report-types";

export function summarizeAdminFinancialLedger(
  rows: readonly AdminFinancialLedgerRow[],
  malformedRecordCount: number,
): AdminFinancialLedgerSummary {
  let paymentSettlementCount = 0;
  let completedRefundCount = 0;
  let defaultFee = 0;
  let reservationComp = 0;

  let grossCollected = 0;
  let completedRefunds = 0;

  let commissionAccrued = 0;
  let commissionReversed = 0;

  let providerVatAccrued = 0;
  let providerVatReversed = 0;

  let platformVatAccrued = 0;
  let platformVatReversed = 0;

  let withholdingAccrued = 0;
  let withholdingReversed = 0;

  for (const row of rows) {
    if (
      row.entryType ===
        "payment_settled"
    ) {
      paymentSettlementCount +=
        1;
    } else if (row.entryType === "refund_completed") {
      completedRefundCount +=
        1;
    }

    grossCollected =
      addMoney(
        grossCollected,
        row.grossAmountInCentavos,
      );
    defaultFee = addMoney(defaultFee, row.feastaCancellationFeeEarnedInCentavos ?? 0);
    reservationComp = addMoney(reservationComp, row.providerReservationCompInCentavos ?? 0);

    completedRefunds =
      addMoney(
        completedRefunds,
        row.refundAmountInCentavos,
      );

    commissionAccrued =
      addMoney(
        commissionAccrued,
        row.commissionAccruedInCentavos,
      );

    commissionReversed =
      addMoney(
        commissionReversed,
        row.commissionReversedInCentavos,
      );

    providerVatAccrued =
      addMoney(
        providerVatAccrued,
        row.providerVatAccruedInCentavos,
      );

    providerVatReversed =
      addMoney(
        providerVatReversed,
        row.providerVatReversedInCentavos,
      );

    platformVatAccrued =
      addMoney(
        platformVatAccrued,
        row.platformVatAccruedInCentavos,
      );

    platformVatReversed =
      addMoney(
        platformVatReversed,
        row.platformVatReversedInCentavos,
      );

    withholdingAccrued =
      addMoney(
        withholdingAccrued,
        row.withholdingAccruedInCentavos,
      );

    withholdingReversed =
      addMoney(
        withholdingReversed,
        row.withholdingReversedInCentavos,
      );
  }

  return {
    feastaCancellationFeeInCentavos: defaultFee,
    providerReservationCompInCentavos: reservationComp,
    feastaRevenueInCentavos: subtractMoney(commissionAccrued, commissionReversed) + defaultFee,
    paymentSettlementCount,
    completedRefundCount,

    grossCollectedInCentavos:
      grossCollected,

    completedRefundsInCentavos:
      completedRefunds,

    customerCashMovementInCentavos:
      subtractMoney(
        grossCollected,
        completedRefunds,
      ),

    commissionAccruedInCentavos:
      commissionAccrued,

    commissionReversedInCentavos:
      commissionReversed,

    commissionNetMovementInCentavos:
      subtractMoney(
        commissionAccrued,
        commissionReversed,
      ),

    providerVatAccruedInCentavos:
      providerVatAccrued,

    providerVatReversedInCentavos:
      providerVatReversed,

    providerVatNetMovementInCentavos:
      subtractMoney(
        providerVatAccrued,
        providerVatReversed,
      ),

    platformVatAccruedInCentavos:
      platformVatAccrued,

    platformVatReversedInCentavos:
      platformVatReversed,

    platformVatNetMovementInCentavos:
      subtractMoney(
        platformVatAccrued,
        platformVatReversed,
      ),

    withholdingAccruedInCentavos:
      withholdingAccrued,

    withholdingReversedInCentavos:
      withholdingReversed,

    withholdingNetMovementInCentavos:
      subtractMoney(
        withholdingAccrued,
        withholdingReversed,
      ),

    malformedRecordCount:
      safeCount(
        malformedRecordCount,
      ),
  };
}

export function summarizeAdminProviderEarnings(
  rows: readonly AdminProviderEarningPeriodRow[],
  malformedRecordCount: number,
): AdminProviderEarningPeriodSummary {
  let originalEarning = 0;
  let reversed = 0;
  let net = 0;

  let pending = 0;
  let available = 0;
  let paid = 0;

  for (const row of rows) {
    originalEarning =
      addMoney(
        originalEarning,
        row.originalEarningInCentavos,
      );

    reversed =
      addMoney(
        reversed,
        row.reversedAmountInCentavos,
      );

    net =
      addMoney(
        net,
        row.netEarningInCentavos,
      );

    pending =
      addMoney(
        pending,
        row.pendingAmountInCentavos,
      );

    available =
      addMoney(
        available,
        row.availableAmountInCentavos,
      );

    paid =
      addMoney(
        paid,
        row.paidAmountInCentavos,
      );
  }

  return {
    earningCount:
      rows.length,

    originalEarningInCentavos:
      originalEarning,

    reversedAmountInCentavos:
      reversed,

    netEarningInCentavos:
      net,

    pendingAmountInCentavos:
      pending,

    availableAmountInCentavos:
      available,

    paidAmountInCentavos:
      paid,

    malformedRecordCount:
      safeCount(
        malformedRecordCount,
      ),

    basis:
      "earnings_created_in_period_current_state",
  };
}

export function summarizeAdminSettlementPayouts(
  rows: readonly AdminSettlementPayoutRow[],
  malformedRecordCount: number,
): AdminSettlementPayoutSummary {
  let paidOut = 0;
  let reconciliationRequiredCount =
    0;

  for (const row of rows) {
    paidOut =
      addMoney(
        paidOut,
        row.paidOutAmountInCentavos,
      );

    if (
      row.reconciliationRequired
    ) {
      reconciliationRequiredCount +=
        1;
    }
  }

  return {
    payoutRecordCount:
      rows.length,

    paidOutAmountInCentavos:
      paidOut,

    reconciliationRequiredCount,

    malformedRecordCount:
      safeCount(
        malformedRecordCount,
      ),

    basis:
      "settlements_paid_out_in_period",
  };
}

export function summarizeAdminGatewayFees(
  rows: readonly AdminGatewayFeeEvidenceRow[],
): AdminGatewayFeeEvidenceSummary {
  let observedCount = 0;
  let unavailableCount = 0;
  let invalidCount = 0;

  let observedFee = 0;

  for (const row of rows) {
    switch (
      row.status
    ) {
      case "observed":
        observedCount +=
          1;

        observedFee =
          addMoney(
            observedFee,
            row.amountInCentavos ??
              0,
          );

        break;

      case "unavailable":
        unavailableCount +=
          1;

        break;

      case "invalid":
        invalidCount +=
          1;

        break;
    }
  }

  const successfulPaymentCount =
    rows.length;

  const evidenceCompleteness =
    successfulPaymentCount === 0
      ? "no_successful_payments"
      : invalidCount > 0
        ? "invalid"
        : observedCount ===
            successfulPaymentCount
          ? "complete"
          : observedCount === 0
            ? "unavailable"
            : "partial";

  return {
    successfulPaymentCount,

    observedCount,
    unavailableCount,
    invalidCount,

    observedFeeInCentavos:
      observedFee,

    evidenceCompleteness,

    authoritativeNetPlatformRevenueInCentavos:
      null,
  };
}

function addMoney(
  left: number,
  right: number,
): number {
  if (
    !Number.isSafeInteger(left) ||
    left < 0 ||
    !Number.isSafeInteger(right) ||
    right < 0
  ) {
    throw new Error(
      "Admin financial amount is invalid.",
    );
  }

  const result =
    left +
    right;

  if (
    !Number.isSafeInteger(result)
  ) {
    throw new Error(
      "Admin financial total exceeds the safe integer range.",
    );
  }

  return result;
}

function subtractMoney(
  left: number,
  right: number,
): number {
  if (
    !Number.isSafeInteger(left) ||
    left < 0 ||
    !Number.isSafeInteger(right) ||
    right < 0
  ) {
    throw new Error(
      "Admin financial movement is invalid.",
    );
  }

  const result =
    left -
    right;

  if (
    !Number.isSafeInteger(result)
  ) {
    throw new Error(
      "Admin financial movement exceeds the safe integer range.",
    );
  }

  return result;
}

function safeCount(
  value: number,
): number {
  return Number.isSafeInteger(
      value,
    ) &&
    value >= 0
    ? value
    : 0;
}
