import type {
  PaymentGateway,
  PaymentStatus,
  PaymentType,
  ProviderRequestStatus,
} from "@feasta/shared-types";

export type CustomerPaymentStatusFilter =
  | "all"
  | PaymentStatus;

export type CustomerPayment = {
  id: string;
  paymentId: string;

  bookingId: string;
  bookingCode: string | null;
  providerRequestId: string;

  providerId: string;
  providerName: string;

  amountInCentavos: number;
  formattedAmount: string;
  currency: string;

  paymentType: PaymentType;
  gateway: PaymentGateway;
  status: PaymentStatus;

  canStartCheckout: boolean;

  createdAt: string | null;
  updatedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  expiredAt: string | null;
  refundedAt: string | null;
};

export type CustomerPaymentStatistics = {
  totalPayments: number;
  awaitingPayment: number;
  processing: number;
  paid: number;
  failedOrExpired: number;
  refunded: number;

  totalPaidInCentavos: number;
  totalPaidFormatted: string;
};

export type CustomerPaymentFilters = {
  search: string;
  status: CustomerPaymentStatusFilter;

  pageSize: number;
  cursor?: string | null;
};

export type CustomerPaymentPage = {
  payments: CustomerPayment[];
  statistics: CustomerPaymentStatistics;

  nextCursor: string | null;
  hasMore: boolean;
};

export type CreateCustomerPaymentSessionInput = {
  providerRequestId: string;
  idempotencyKey: string;
};

export type CreateCustomerPaymentSessionResult = {
  paymentId: string;
  providerRequestId: string;
  bookingId: string;
  checkoutUrl: string;
  created: boolean;
};

export type CustomerPaymentReturnKind =
  | "success"
  | "cancelled"
  | "invalid";

export type CustomerPaymentReturnLookup = {
  paymentId: string;
  providerRequestId: string;
  bookingId: string;
};

export type CustomerPaymentReturnDetails = {
  providerRequestId: string;

  providerName: string;
  serviceLabel: string;
  categoryLabel: string;

  requestAmountFormatted: string;
  downPaymentAmountFormatted: string;

  paymentStatus: PaymentStatus;
  providerRequestStatus: ProviderRequestStatus;
  canStartCheckout: boolean;

  bookingLabel: string;
  bookingDetailsPath: string;
};

export type CustomerPaymentReturnLoadResult =
  | {
      status: "ready";
      payment: CustomerPaymentReturnDetails;
    }
  | {
      status: "unavailable";
    };
