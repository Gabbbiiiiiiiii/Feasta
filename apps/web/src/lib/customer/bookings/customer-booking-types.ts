import type {
  MainEventStatus,
  ProviderRequestStatus,
  ProviderRequestType,
} from "@feasta/shared-types";
import type {
  CustomerBookingStatusFilter,
} from "@/lib/customer/bookings/customer-booking-status";

export type {
  CustomerBookingStatusFilter,
} from "@/lib/customer/bookings/customer-booking-status";

export type CustomerBookingService = {
  id: string;
  name: string;
  category: string | null;

  price: number;
  downPaymentPercentage: number;
  downPaymentAmount: number;
};

export type CustomerBookingProviderRequest = {
  id: string;
  providerRequestId: string;

  mainEventId: string;
  providerId: string;
  providerName: string;

  type: ProviderRequestType;

  packageId: string | null;
  packageName: string | null;

  services: CustomerBookingService[];

  amount: number;
  downPaymentAmount: number;
  downPaymentPercentage: number;
  remainingBalance: number;

  status: ProviderRequestStatus;
  paymentStatus: string;
  paymentId: string | null;

  rejectionReason: string | null;
  cancellationReason: string | null;

  requestedAt: string | null;
  respondedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  replacementStatus: string | null;
  confirmedAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
};

export type CustomerBooking = {
  id: string;
  bookingId: string;
  bookingCode: string;

  eventType: string;
  eventDate: string | null;
  eventTime: string;
  eventEndTime: string;

  guestCount: number;
  eventLocation: string;
  eventAddress: string;

  providerId: string;
  providerName: string;

  packageId: string | null;
  packageName: string | null;

  status: MainEventStatus;
  paymentStatus: string;

  estimatedEventTotal: number;
  downPaymentAmount: number;
  remainingBalance: number;

  providerRequestCount: number;
  pendingProviderRequestCount: number;
  acceptedProviderRequestCount: number;
  waitingPaymentProviderRequestCount: number;
  paymentProcessingProviderRequestCount: number;
  confirmedProviderRequestCount: number;
  rejectedProviderRequestCount: number;
  completedProviderRequestCount: number;

  submittedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CustomerBookingStatistics = {
  total: number;
  upcoming: number;
  awaitingProvider: number;
  awaitingPayment: number;
  confirmed: number;
  completed: number;
  cancelledOrExpired: number;
};

export type CustomerBookingFilters = {
  search: string;
  status: CustomerBookingStatusFilter;

  pageSize: number;
  cursor?: string | null;
};

export type CustomerBookingPage = {
  bookings: CustomerBooking[];
  statistics: CustomerBookingStatistics;

  nextCursor: string | null;
  hasMore: boolean;
};

export type CustomerBookingResults = {
  bookings: CustomerBooking[];

  nextCursor: string | null;
  hasMore: boolean;
};

export type CustomerBookingDetails = {
  booking: CustomerBooking;
  providerRequests: CustomerBookingProviderRequest[];
};

export type CustomerBookingDetailsResult = {
  details: CustomerBookingDetails;
};

export type CustomerBookingTimelineActorRole =
  | "customer"
  | "provider"
  | "system";

export type CustomerBookingTimelineEntry = {
  id: string;
  type: string | null;
  status: MainEventStatus | null;
  title: string;
  description: string | null;
  actorRole: CustomerBookingTimelineActorRole | null;
  providerName: string | null;
  createdAt: string;
};

export type CustomerBookingTimeline = {
  entries: CustomerBookingTimelineEntry[];
  truncated: boolean;
};

export type CustomerBookingDetailPageResult = {
  details: CustomerBookingDetails;
  timeline: CustomerBookingTimeline;
};
