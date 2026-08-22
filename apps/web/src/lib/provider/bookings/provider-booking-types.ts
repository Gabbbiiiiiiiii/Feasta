import type {
  MainEventStatus,
  PaymentStatus,
  ProviderRequestStatus,
  ProviderRequestType,
} from "@feasta/shared-types";

export type ProviderBookingFilter =
  | "all"
  | "pending"
  | "accepted"
  | "confirmed"
  | "upcoming"
  | "in_progress"
  | "completed"
  | "cancelled";

export type ProviderBookingFilters = {
  status: ProviderBookingFilter;
  pageSize: number;
  cursor?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type ProviderBookingPayment = {
  id: string;
  status: PaymentStatus;
  amount: number;
  amountInCentavos: number;
  currency: string;
  paymentType: string;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ProviderBookingService = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type ProviderBooking = {
  providerRequestId: string;
  mainEventId: string;
  providerId: string;
  customerId: string;

  providerRequestStatus: ProviderRequestStatus;
  mainEventStatus: MainEventStatus;
  paymentStatus: PaymentStatus | null;
  requestType: ProviderRequestType;

  eventType: string;
  eventDate: string;
  eventTime: string | null;
  eventEndTime: string | null;
  guestCount: number;
  venueAddress: string;
  locationSummary: string;

  customerDisplayName: string;
  packageId: string | null;
  packageName: string | null;
  services: ProviderBookingService[];
  serviceSummary: string;
  serviceCategory: string | null;

  requestedAmount: number;
  acceptedAmount: number | null;
  downPaymentAmount: number;
  paymentAmount: number | null;
  remainingBalance: number;
  currency: string;
  payment: ProviderBookingPayment | null;

  createdAt: string;
  updatedAt: string | null;
  acceptedAt: string | null;
  confirmedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;

  rejectionReason: string | null;
  cancellationReason: string | null;
  cancellationActor: string | null;
  timelineCount: number | null;
};

export type ProviderBookingPage = {
  bookings: ProviderBooking[];
  summary: ProviderBookingSummary;
  nextCursor: string | null;
  hasMore: boolean;
  skippedMalformedCount: number;
};

export type ProviderBookingSummary = {
  pending: number;
  awaitingPayment: number;
  confirmed: number;
  upcoming: number;
  inProgress: number;
  completed: number;
};

export type ProviderBookingTimelineEntry = {
  id: string;
  type: string;
  status: MainEventStatus | null;
  title: string;
  description: string | null;
  createdByRole: string | null;
  relatedProviderRequestId: string | null;
  createdAt: string;
};

export type ProviderBookingTimeline = {
  providerRequestId: string;
  mainEventId: string;
  entries: ProviderBookingTimelineEntry[];
};
