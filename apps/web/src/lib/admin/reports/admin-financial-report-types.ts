import type {
  AdminPaymentProviderEarningStatus,
  AdminPaymentProviderSettlementStatus,
} from "@/lib/admin/payments/admin-payment-types";

import type {
  AdminReportResolvedPeriod,
} from "./admin-report-types";

export type AdminFinancialLedgerEntryType =
  | "payment_settled"
  | "refund_completed";

export type AdminFinancialLedgerRow = {
  ledgerEntryId: string;
  entryType: AdminFinancialLedgerEntryType;

  paymentId: string;
  providerRequestId: string;
  mainEventId: string;
  providerId: string;

  currency: "PHP";

  grossAmountInCentavos: number;
  refundAmountInCentavos: number;

  commissionAccruedInCentavos: number;
  commissionReversedInCentavos: number;

  providerVatAccruedInCentavos: number;
  providerVatReversedInCentavos: number;

  platformVatAccruedInCentavos: number;
  platformVatReversedInCentavos: number;

  withholdingAccruedInCentavos: number;
  withholdingReversedInCentavos: number;

  createdAt: string;
};

export type AdminProviderEarningPeriodRow = {
  earningId: string;
  paymentId: string;
  providerRequestId: string;
  mainEventId: string;
  providerId: string;

  status: AdminPaymentProviderEarningStatus;

  currency: "PHP";

  originalEarningInCentavos: number;
  reversedAmountInCentavos: number;
  netEarningInCentavos: number;

  pendingAmountInCentavos: number;
  availableAmountInCentavos: number;
  paidAmountInCentavos: number;

  createdAt: string;
};

export type AdminSettlementPayoutRow = {
  settlementId: string;
  earningId: string;
  paymentId: string;
  providerId: string;

  status: AdminPaymentProviderSettlementStatus;

  currency: "PHP";

  netSettlementAmountInCentavos: number;
  paidOutAmountInCentavos: number;

  reconciliationRequired: boolean;

  paidOutAt: string;
};

export type AdminGatewayFeeEvidenceStatus =
  | "observed"
  | "unavailable"
  | "invalid";

export type AdminGatewayFeeEvidenceRow = {
  paymentId: string;
  providerId: string;

  currency: "PHP";

  status: AdminGatewayFeeEvidenceStatus;

  amountInCentavos: number | null;

  paidAt: string;
};

export type AdminFinancialLedgerSummary = {
  paymentSettlementCount: number;
  completedRefundCount: number;

  grossCollectedInCentavos: number;
  completedRefundsInCentavos: number;

  /*
   * This is a period movement and may be negative when
   * refunds completed in this period relate to collections
   * recorded in an earlier reporting period.
   */
  customerCashMovementInCentavos: number;

  commissionAccruedInCentavos: number;
  commissionReversedInCentavos: number;
  commissionNetMovementInCentavos: number;

  providerVatAccruedInCentavos: number;
  providerVatReversedInCentavos: number;
  providerVatNetMovementInCentavos: number;

  platformVatAccruedInCentavos: number;
  platformVatReversedInCentavos: number;
  platformVatNetMovementInCentavos: number;

  withholdingAccruedInCentavos: number;
  withholdingReversedInCentavos: number;
  withholdingNetMovementInCentavos: number;

  malformedRecordCount: number;
};

export type AdminProviderEarningPeriodSummary = {
  earningCount: number;

  originalEarningInCentavos: number;
  reversedAmountInCentavos: number;
  netEarningInCentavos: number;

  pendingAmountInCentavos: number;
  availableAmountInCentavos: number;
  paidAmountInCentavos: number;

  malformedRecordCount: number;

  basis:
    "earnings_created_in_period_current_state";
};

export type AdminSettlementPayoutSummary = {
  payoutRecordCount: number;

  paidOutAmountInCentavos: number;

  reconciliationRequiredCount: number;

  malformedRecordCount: number;

  basis:
    "settlements_paid_out_in_period";
};

export type AdminGatewayFeeEvidenceCompleteness =
  | "no_successful_payments"
  | "complete"
  | "partial"
  | "unavailable"
  | "invalid";

export type AdminGatewayFeeEvidenceSummary = {
  successfulPaymentCount: number;

  observedCount: number;
  unavailableCount: number;
  invalidCount: number;

  observedFeeInCentavos: number;

  evidenceCompleteness:
    AdminGatewayFeeEvidenceCompleteness;

  /*
   * Deliberately null.
   *
   * FEASTA does not infer authoritative platform net
   * revenue from partial or period-misaligned gateway-fee
   * evidence.
   */
  authoritativeNetPlatformRevenueInCentavos:
    null;
};

export type AdminFinancialReport = {
  documentKind:
    "admin_financial_report";

  currency:
    "PHP";

  timeZone:
    "Asia/Manila";

  period:
    AdminReportResolvedPeriod;

  ledgerRows:
    AdminFinancialLedgerRow[];

  providerEarningRows:
    AdminProviderEarningPeriodRow[];

  settlementPayoutRows:
    AdminSettlementPayoutRow[];

  gatewayFeeRows:
    AdminGatewayFeeEvidenceRow[];

  ledger:
    AdminFinancialLedgerSummary;

  providerEarnings:
    AdminProviderEarningPeriodSummary;

  settlementPayouts:
    AdminSettlementPayoutSummary;

  gatewayFees:
    AdminGatewayFeeEvidenceSummary;

  generatedAt:
    string;

  scopeNotice:
    string;

  gatewayFeeNotice:
    string;

  recordNotice:
    string;
};