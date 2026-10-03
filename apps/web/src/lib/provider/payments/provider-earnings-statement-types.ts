import type {
  ProviderEarningStatus,
  ProviderSettlementStatus,
} from "./provider-finance-types";

export type ProviderEarningsStatementPeriod = {
  month:
    string;

  label:
    string;

  startAt:
    string;

  endAtExclusive:
    string;

  timeZone:
    "Asia/Manila";
};

export type ProviderEarningsStatementSettlement = {
  settlementId:
    string;

  status:
    ProviderSettlementStatus;

  netSettlementAmountInCentavos:
    number;

  reservedAmountInCentavos:
    number;

  paidOutAmountInCentavos:
    number;

  reconciliationRequired:
    boolean;

  paidOutAt:
    string | null;
};

export type ProviderEarningsStatementRow = {
  earningId:
    string;

  paymentId:
    string;

  providerRequestId:
    string;

  mainEventId:
    string;

  status:
    ProviderEarningStatus;

  currency:
    "PHP";

  /*
   * Original trusted financial allocation for this
   * successful Customer payment.
   */
  grossCollectedInCentavos:
    number;

  commissionDeductedInCentavos:
    number;

  withholdingDeductedInCentavos:
    number;

  /*
   * Informational VAT components.
   *
   * Provider VAT is already contained in the service
   * gross. FEASTA VAT belongs to commission-side
   * accounting. Neither is another Provider earning
   * deduction here.
   */
  providerVatComponentInCentavos:
    number;

  platformVatOnCommissionInCentavos:
    number;

  earningAmountInCentavos:
    number;

  /*
   * Refund-driven Provider earning reversal.
   *
   * This is the Provider economic share reversed by
   * completed refunds. It is not the Customer's full
   * refunded amount.
   */
  reversedAmountInCentavos:
    number;

  netEarningAmountInCentavos:
    number;

  pendingAmountInCentavos:
    number;

  availableAmountInCentavos:
    number;

  paidAmountInCentavos:
    number;

  createdAt:
    string;

  updatedAt:
    string | null;

  settlement:
    ProviderEarningsStatementSettlement | null;
};

export type ProviderEarningsStatementTotals = {
  customerGrossCollectedInCentavos:
    number;

  commissionDeductedInCentavos:
    number;

  withholdingDeductedInCentavos:
    number;

  providerVatComponentInCentavos:
    number;

  platformVatOnCommissionInCentavos:
    number;

  originalProviderEarningInCentavos:
    number;

  providerEarningReversedInCentavos:
    number;

  netProviderEarningInCentavos:
    number;

  pendingAmountInCentavos:
    number;

  availableAmountInCentavos:
    number;

  paidAmountInCentavos:
    number;

  settlementPaidOutInCentavos:
    number;
};

export type ProviderEarningsStatement = {
  documentKind:
    "provider_earnings_statement";

  providerId:
    string;

  providerName:
    string;

  currency:
    "PHP";

  period:
    ProviderEarningsStatementPeriod;

  rows:
    ProviderEarningsStatementRow[];

  totals:
    ProviderEarningsStatementTotals;

  skippedMalformedCount:
    number;

  missingSettlementCount:
    number;

  generatedAt:
    string;

  recordNotice:
    string;
};