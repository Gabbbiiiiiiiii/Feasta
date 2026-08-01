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

  lastWebhookEventId: string | null;

  issues: AdminPaymentIssue[];

  refundEligibility:
    AdminPaymentRefundEligibility;
};

export type AdminPaymentStatistics = {
  confirmedVolumeInCentavos: number;
  pendingProcessingCount: number;
  failedExpiredCount: number;
  refundedAmountInCentavos: number;

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

  webhooks: AdminPaymentWebhookEvent[];
  auditHistory: AdminPaymentAuditEntry[];
};

export type AdminPaymentRefundInput = {
  paymentId: string;
  reason: string;
  idempotencyKey: string;
};

export type AdminPaymentRefundResult = {
  paymentId: string;
  refundId: string;
  awaitingWebhook: boolean;
  idempotentReplay: boolean;
};