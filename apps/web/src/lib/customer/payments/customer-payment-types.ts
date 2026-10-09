import type {
  CustomerPaymentChoice,
  PaymentGateway,
  PaymentStatus,
  PaymentType,
  ProviderRequestStatus,
} from "@feasta/shared-types";

export type CustomerPaymentStatusFilter =
  | "all"
  | PaymentStatus;

export type CustomerPayment = {
  paymentChoice: CustomerPaymentChoice | null;
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

  /*
   * Customer-safe refund projection.
   *
   * These values are derived from trusted backend payment
   * and refund accounting. They are display-only.
   */
  refundedAmountInCentavos: number;
  formattedRefundedAmount: string;

  netPaidInCentavos: number;
  formattedNetPaid: string;

  canViewReceipt: boolean;

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


export type CustomerPaymentReceiptStatus =
  | "paid"
  | "partially_refunded"
  | "refunded";

export type CustomerPaymentReceipt = {
  documentKind:
    "payment_receipt";

  paymentId: string;

  bookingId: string;
  bookingCode: string | null;

  providerRequestId: string;
  providerId: string;
  providerName: string;

  serviceLabel: string;

  paymentChoice:
    CustomerPaymentChoice | null;

  paymentType:
    PaymentType;

  gateway:
    PaymentGateway;

  status:
    CustomerPaymentReceiptStatus;

  currency:
    "PHP";

  amountPaidInCentavos:
    number;

  amountPaidFormatted:
    string;

  refundedAmountInCentavos:
    number;

  refundedAmountFormatted:
    string;

  netPaidInCentavos:
    number;

  netPaidFormatted:
    string;

  paidAt:
    string | null;

  refundedAt:
    string | null;

  recordNotice:
    string;
};

export type CustomerPaymentReceiptLoadResult =
  | {
      status: "ready";
      receipt:
        CustomerPaymentReceipt;
    }
  | {
      status: "unavailable";
    };
export type CreateCustomerPaymentSessionInput = {
  providerRequestId: string;
  paymentChoice: CustomerPaymentChoice;
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
};

export type CustomerPaymentReturnDetails = {
  paymentChoice: CustomerPaymentChoice | null;
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
