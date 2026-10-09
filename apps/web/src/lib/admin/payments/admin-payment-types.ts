import type {
  PaymentGateway,
  PaymentStatus,
  PaymentType,
} from "@feasta/shared-types";

export type AdminPaymentStatus =
  PaymentStatus;

export type AdminPaymentType =
  PaymentType;

export type AdminPaymentGateway =
  PaymentGateway;

export type AdminPaymentStatusFilter =
  | "all"
  | AdminPaymentStatus;

export type AdminPaymentTypeFilter =
  | "all"
  | AdminPaymentType;

export type AdminPaymentDateFilter =
  | "all"
  | "today"
  | "last_7_days"
  | "last_30_days";

export type AdminPaymentSortField =
  | "createdAt"
  | "paidAt"
  | "amountInCentavos";

export type AdminPaymentSortDirection =
  | "ascending"
  | "descending";

export type AdminPaymentIssue =
  | "stale_processing"
  | "missing_booking"
  | "missing_provider_request"
  | "missing_provider"
  | "missing_gateway_reference"
  | "invalid_amount"
  | "booking_status_mismatch"
  | "refund_awaiting_webhook";

export type AdminPaymentIssueFilter =
  | "all"
  | "with_issues"
  | "without_issues";

export type AdminPaymentRefundEligibility = {
  eligible: boolean;
  reason:
  | "eligible"
  | "refund_pending"
  | "not_paid"
  | "already_refunded"
  | "missing_gateway_reference"
  | "invalid_amount"
  | "invalid_currency";
};

export type AdminPayment = {
  bookingPolicy?: import("@/lib/payments/booking-policy-v3-presentation").BookingPolicyPresentation | null;
  id: string;
  paymentId: string;

  bookingId: string;
  mainEventId: string;
  bookingCode: string | null;

  providerRequestId: string | null;

  customerId: string;
  customerName: string;
  customerEmail: string | null;

  providerId: string;
  providerName: string;

  amountInCentavos: number;
  formattedAmount: string;
  currency: string;

  paymentType: AdminPaymentType;
  gateway: AdminPaymentGateway;
  status: AdminPaymentStatus;

  gatewayResourceId: string | null;
  gatewayCheckoutId: string | null;

  createdAt: string | null;
  updatedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  expiredAt: string | null;
  refundedAt: string | null;

  refundedAmountFormatted?: string | null;
  refundPending?: boolean;

  lastWebhookEventId: string | null;

  issues: AdminPaymentIssue[];

  refundEligibility:
    AdminPaymentRefundEligibility;
};

export type AdminPaymentStatistics = {
  confirmedVolumeInCentavos: number | null;
  pendingProcessingCount: number;
  failedPaymentCount: number;
  failedExpiredCount: number;
  failedPayoutCount: number;
  reconciliationRequiredCount: number;
  refundedAmountInCentavos: number | null;

  confirmedVolumeFormatted: string;
  refundedAmountFormatted: string;
};

export type AdminPaymentFilters = {
  search: string;

  status: AdminPaymentStatusFilter;
  paymentType: AdminPaymentTypeFilter;
  date: AdminPaymentDateFilter;
  issue: AdminPaymentIssueFilter;

  sortField: AdminPaymentSortField;
  sortDirection: AdminPaymentSortDirection;

  pageSize: number;
  cursor?: string | null;
};

export type AdminPaymentPage = {
  payments: AdminPayment[];
  statistics: AdminPaymentStatistics;

  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminFinanceAttentionKind =
  | "failed_payout"
  | "reconciliation_required"
  | "ambiguous_payout_setup";

export type AdminFinanceAttentionRecordState =
  | "valid"
  | "invalid";

export type AdminFinanceAttentionItem = {
  id: string;
  providerDisbursementId?: string | null;
  canonicalDisbursementStatus?: string | null;
  failedDisbursementRetryEligible?: boolean;

  kind: AdminFinanceAttentionKind;

  recordState:
    AdminFinanceAttentionRecordState;

  paymentId: string | null;
  providerId: string | null;
  settlementId: string | null;
  payoutAttemptId: string | null;

  status:
    | "failed"
    | "reconciliation_required"
    | "ambiguous"
    | null;

  amountInCentavos: number | null;
  formattedAmount: string | null;

  reason: string | null;
  updatedAt: string | null;

  expectedUpdatedAtMillis: number | null;

  payment: AdminPayment | null;
};

export type AdminFinanceAttentionQueue = {
  items: AdminFinanceAttentionItem[];
};

export type AdminPayoutSetupRepairInput = {
  providerId: string;
  expectedUpdatedAtMillis: number;
};

export type AdminPayoutSetupRepairResult = {
  providerId: string;
  setupStatus: "action_required";
  inviteCreationState: "rejected";
  payoutReady: false;
};
export type AdminPaymentDetailsResult = {
  details: AdminPaymentDetails;
};

export type AdminPaymentWebhookEvent = {
  id: string;
  eventId: string;
  eventType: string;
  gatewayResourceId: string | null;

  status: string;
  reason: string | null;

  processedAt: string | null;
};

export type AdminPaymentAuditEntry = {
  id: string;

  action: string;
  actorId: string;
  actorRole: string;

  reason: string | null;
  source: string | null;

  beforeStatus: string | null;
  afterStatus: string | null;

  createdAt: string | null;
};

export type AdminPaymentFinanceRecordState =
  | "not_found"
  | "valid"
  | "invalid"
  | "ambiguous";

export type AdminPaymentProviderEarningStatus =
  | "pending"
  | "available"
  | "paid"
  | "reversed";

export type AdminPaymentProviderSettlementStatus =
  | "awaiting_availability"
  | "ready"
  | "reserved"
  | "processing"
  | "paid"
  | "reconciliation_required"
  | "cancelled";

export type AdminPaymentProviderEarningDetails = {
  recordState: AdminPaymentFinanceRecordState;

  earningId: string | null;
  paymentId: string | null;
  providerRequestId: string | null;
  mainEventId: string | null;

  status:
    AdminPaymentProviderEarningStatus | null;

  earningAmountInCentavos: number | null;
  pendingAmountInCentavos: number | null;
  availableAmountInCentavos: number | null;
  paidAmountInCentavos: number | null;
  reversedAmountInCentavos: number | null;

  formattedEarningAmount: string | null;
  formattedPendingAmount: string | null;
  formattedAvailableAmount: string | null;
  formattedPaidAmount: string | null;
  formattedReversedAmount: string | null;

  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminPaymentProviderSettlementDetails = {
  recordState: AdminPaymentFinanceRecordState;

  settlementId: string | null;
  earningId: string | null;
  paymentId: string | null;
  providerRequestId: string | null;
  mainEventId: string | null;

  status:
    AdminPaymentProviderSettlementStatus | null;

  netSettlementAmountInCentavos: number | null;
  reservedAmountInCentavos: number | null;
  paidOutAmountInCentavos: number | null;

  formattedNetSettlementAmount: string | null;
  formattedReservedAmount: string | null;
  formattedPaidOutAmount: string | null;

  reconciliationRequired: boolean | null;
  reconciliationReason: string | null;

  activePayoutAttemptId: string | null;
  lastPayoutAttemptId: string | null;

  createdAt: string | null;
  updatedAt: string | null;
  paidOutAt: string | null;
};

export type AdminPaymentProviderPayoutAttemptStatus =
  | "reserved"
  | "dispatching"
  | "submitted"
  | "processing"
  | "succeeded"
  | "failed"
  | "ambiguous";

export type AdminPaymentPayoutAttemptRecordState =
  | "not_referenced"
  | "not_found"
  | "valid"
  | "invalid";

export type AdminPaymentProviderPayoutAttemptDetails = {
  recordState:
    AdminPaymentPayoutAttemptRecordState;

  payoutAttemptId: string | null;
  settlementId: string | null;
  earningId: string | null;
  providerId: string | null;

  amountInCentavos: number | null;
  formattedAmount: string | null;

  status:
    AdminPaymentProviderPayoutAttemptStatus | null;

  gateway: "paymongo" | null;
  gatewayResourceId: string | null;

  failureCode: string | null;
  failureMessage: string | null;

  createdAt: string | null;
  updatedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
};

export type AdminPaymentProviderPayoutAttempts = {
  active:
    AdminPaymentProviderPayoutAttemptDetails;

  last:
    AdminPaymentProviderPayoutAttemptDetails;
};
export type AdminPaymentFinancialRecordState =
  | "not_available"
  | "valid"
  | "invalid";

export type AdminPaymentRemainingBalanceStatus =
  | "not_applicable"
  | "not_due"
  | "due_soon"
  | "due"
  | "grace_period"
  | "overdue"
  | "paid"
  | "cancelled";

export type AdminPaymentTaxStatus =
  | "non_vat"
  | "vat_registered";

export type AdminPaymentProviderTaxVerificationStatus =
  | "pending"
  | "verified"
  | "rejected";

export type AdminPaymentFinancialSummary = {
  recordState:
    AdminPaymentFinancialRecordState;

  bookingValueInCentavos: number | null;
  collectedAmountInCentavos: number | null;
  remainingCustomerBalanceInCentavos:
    number | null;

  formattedBookingValue: string | null;
  formattedCollectedAmount: string | null;
  formattedRemainingCustomerBalance:
    string | null;

  remainingBalanceStatus:
    AdminPaymentRemainingBalanceStatus | null;

  remainingBalanceDueAt: string | null;
  remainingBalanceGraceEndsAt: string | null;
  fullySettled: boolean | null;

  providerTaxType:
    AdminPaymentTaxStatus | null;

  providerTaxVerificationStatus:
    AdminPaymentProviderTaxVerificationStatus | null;

  providerVatAccruedInCentavos:
    number | null;

  providerVatReversedInCentavos:
    number | null;

  providerVatNetInCentavos:
    number | null;

  formattedProviderVatAccrued:
    string | null;

  formattedProviderVatReversed:
    string | null;

  formattedProviderVatNet:
    string | null;

  platformCommissionRateBps:
    number | null;

  commissionAccruedInCentavos:
    number | null;

  commissionReversedInCentavos:
    number | null;

  commissionEarnedInCentavos:
    number | null;

  formattedCommissionAccrued:
    string | null;

  formattedCommissionReversed:
    string | null;

  formattedCommissionEarned:
    string | null;

  platformTaxStatus:
    AdminPaymentTaxStatus | null;

  platformVatRateBps:
    number | null;

  platformVatAccruedInCentavos:
    number | null;

  platformVatReversedInCentavos:
    number | null;

  platformVatNetInCentavos:
    number | null;

  formattedPlatformVatAccrued:
    string | null;

  formattedPlatformVatReversed:
    string | null;

  formattedPlatformVatNet:
    string | null;

  financialPolicyVersion:
    number | null;
};

export type AdminPaymentPayoutSetupStatus =
  | "not_started"
  | "onboarding"
  | "action_required"
  | "ready"
  | "unavailable";

export type AdminPaymentSettlementTransportMode =
  | "disabled"
  | "wallet_transfer"
  | "workflow";

export type AdminPaymentPayoutAccountDetails = {
  recordState:
    AdminPaymentFinancialRecordState;

  setupStatus:
    AdminPaymentPayoutSetupStatus | null;

  linkedAccountType:
    "consumer" | "merchant" | null;

  invitationStatus: string | null;
  activationStatus: string | null;

  payoutReady: boolean | null;

  relationshipStatus: string | null;

  settlementTransportMode:
    AdminPaymentSettlementTransportMode | null;

  settlementTransportReady:
    boolean | null;

  updatedAt: string | null;
};
export type AdminPaymentProviderFinance = {
  earning:
    AdminPaymentProviderEarningDetails;

  settlement:
    AdminPaymentProviderSettlementDetails;

  payoutAttempts:
    AdminPaymentProviderPayoutAttempts;
};
export type AdminPaymentDetails = {
  payment: AdminPayment;

  booking: {
    exists: boolean;
    id: string;
    bookingCode: string | null;
    eventType: string | null;
    eventDate: string | null;
    status: string | null;
    paymentStatus: string | null;
  };

  providerRequest: {
    exists: boolean;
    id: string | null;
    status: string | null;
    requestType: string | null;
  };

  financialSummary:
    AdminPaymentFinancialSummary;

  payoutAccount:
    AdminPaymentPayoutAccountDetails;

  providerFinance: AdminPaymentProviderFinance;

  webhooks: AdminPaymentWebhookEvent[];
  auditHistory: AdminPaymentAuditEntry[];
};
