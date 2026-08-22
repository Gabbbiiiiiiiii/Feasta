import type {
  MainEventStatus,
  PaymentStatus,
  PaymentType,
  ProviderRequestStatus,
} from "@feasta/shared-types";

export type ProviderPaymentStatus = PaymentStatus;

export type ProviderPaymentFilter =
  | "all"
  | ProviderPaymentStatus;

export type ProviderPaymentFilters = {
  status: ProviderPaymentFilter;
  pageSize: number;
  cursor?: string | null;
};

export type ProviderPaymentRefundStatus =
  | "requested"
  | "processing"
  | "completed"
  | null;

export type ProviderPayment = {
  paymentId: string;
  providerRequestId: string;
  mainEventId: string;

  customerDisplayName: string;
  eventType: string;
  eventDate: string;
  eventTime: string | null;
  serviceSummary: string;

  amount: number;
  amountInCentavos: number;
  formattedAmount: string;
  currency: "PHP";
  paymentType: PaymentType;
  status: ProviderPaymentStatus;
  refundStatus: ProviderPaymentRefundStatus;

  createdAt: string;
  updatedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  expiredAt: string | null;
  refundedAt: string | null;
};

export type ProviderPaymentMetric = {
  count: number;
  totalAmountInCentavos: number;
};

export type ProviderPaymentSummary = {
  confirmedCustomerPayments: ProviderPaymentMetric;
  processingPayments: ProviderPaymentMetric;
  failedPayments: ProviderPaymentMetric;
  expiredPayments: ProviderPaymentMetric;
  fullyRefundedPayments: ProviderPaymentMetric;
  paymentRecords: number;
  refundAwaitingConfirmation: number;
};

export type ProviderPaymentPage = {
  payments: ProviderPayment[];
  summary: ProviderPaymentSummary;
  nextCursor: string | null;
  hasMore: boolean;
  skippedMalformedCount: number;
};

export type ProviderPaymentDetail = {
  payment: ProviderPayment;
  providerRequestStatus: ProviderRequestStatus;
  mainEventStatus: MainEventStatus;
};
