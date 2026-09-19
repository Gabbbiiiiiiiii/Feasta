import type {
  MainEventStatus,
  PaymentStatus,
  ProviderRequestStatus,
  ProviderRequestType,
} from "@feasta/shared-types";

export type AdminBookingStatusFilter =
  | "all"
  | MainEventStatus;

export type AdminBookingOverallPaymentStatus =
  | "unpaid"
  | "pending"
  | "processing"
  | "partially_paid"
  | "paid"
  | "failed"
  | "expired"
  | "refunded";

export type AdminBookingPaymentFilter =
  | "all"
  | AdminBookingOverallPaymentStatus;

export type AdminBookingDateFilter =
  | "all"
  | "today"
  | "upcoming"
  | "past";

export type AdminBookingSortField =
  | "createdAt"
  | "eventDate";

export type AdminBookingSortDirection =
  | "ascending"
  | "descending";

export type AdminBookingCustomer = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
};

export type AdminBookingProviderRequest = {
  id: string;
  mainEventId: string;
  providerId: string;
  providerOwnerId: string | null;

  providerName: string;
  requestType: ProviderRequestType;
  status: ProviderRequestStatus;

  packageId: string | null;
  packageName: string | null;

  subtotal: number;
  downPaymentPercentage: number;
  downPaymentAmount: number;

  paymentId: string | null;
  paymentStatus: PaymentStatus | null;

  acceptedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;

  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminBookingPayment = {
  id: string;
  mainEventId: string;
  providerRequestId: string;
  providerId: string;
  customerId: string;

  amount: number;
  amountInCentavos: number;
  currency: string;

  status: PaymentStatus;
  gateway: string;
  paymentType: string;

  refundStatus: string | null;
  refundId: string | null;
  refundReason: string | null;

  createdAt: string | null;
  updatedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  expiredAt: string | null;
  refundedAt: string | null;
  refundRequestedAt: string | null;
};

export type AdminBooking = {
  id: string;
  reference: string;

  status: MainEventStatus;
  paymentStatus:
    AdminBookingOverallPaymentStatus;

  customerId: string;
  customer: AdminBookingCustomer;

  eventType: string;
  eventDate: string | null;
  eventTime: string | null;
  guestCount: number;

  venueName: string | null;
  venueAddress: string;
  city: string;
  notes: string | null;

  providerRequestCount: number;
  pendingProviderRequestCount: number;
  acceptedProviderRequestCount: number;
  waitingPaymentProviderRequestCount: number;
  paymentProcessingProviderRequestCount: number;
  confirmedProviderRequestCount: number;
  inProgressProviderRequestCount: number;
  completedProviderRequestCount: number;
  rejectedProviderRequestCount: number;
  cancelledProviderRequestCount: number;
  expiredProviderRequestCount: number;

  totalAmount: number;
  totalPaidAmount: number;
  totalRefundedAmount: number;
  outstandingAmount: number;

  providerRequests: AdminBookingProviderRequest[];
  payments: AdminBookingPayment[];

  createdAt: string | null;
  updatedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type AdminBookingStatistics = {
  totalBookings: number;
  pendingApproval: number;
  waitingForPayment: number;
  confirmed: number;
  inProgress: number;
  completed: number;
  needsProviderReplacement: number;
  cancelledOrExpired: number;

  totalProviderRequests: number;
  pendingProviderRequests: number;
  confirmedProviderRequests: number;

  totalPaidAmount: number;
  totalRefundedAmount: number;
};

export type AdminBookingFilters = {
  search: string;
  status: AdminBookingStatusFilter;
  paymentStatus: AdminBookingPaymentFilter;
  date: AdminBookingDateFilter;

  sortField: AdminBookingSortField;
  sortDirection: AdminBookingSortDirection;

  pageSize: number;
  cursor?: string | null;
};

export type AdminBookingPage = {
  bookings: AdminBooking[];
  statistics: AdminBookingStatistics;

  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminBookingDetailsResult = {
  booking: AdminBooking;
};