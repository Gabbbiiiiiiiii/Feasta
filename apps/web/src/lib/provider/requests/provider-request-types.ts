import type {ProviderInitialPaymentPresentation} from "./provider-request-payment-presentation";
import type {
  ProviderRequestStatus,
  ProviderRequestType,
} from "@feasta/shared-types";


export type ProviderRequestEvent = {
  eventType: string;
  eventDate: string | null;
  eventTime: string | null;
  guestCount: number | null;
  venueAddress: string | null;
  city: string | null;
  notes: string | null;
};

export type ProviderRequestCustomer = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
};

export type ProviderRequestPackage = {
  id: string | null;
  name: string | null;
};

export type ProviderRequestService = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type ProviderRequestListItem = {
  initialPaymentPresentation?: ProviderInitialPaymentPresentation;
  bookingReference?: string | null;
  responseUnavailableReason?: string | null;
  id: string;

  mainEventId: string;

  providerId: string;

  type: ProviderRequestType;

  status: ProviderRequestStatus;

  customer: ProviderRequestCustomer;

  package: ProviderRequestPackage | null;

  services: ProviderRequestService[];

  event: ProviderRequestEvent;

  amount: number;

  downPaymentAmount: number;

  paymentPolicy:
    | "full_payment"
    | "deposit_then_balance"
    | null;

  downPaymentPercentage: number | null;

  rejectionReason: string | null;

  createdAt: string | null;

  updatedAt: string | null;

  respondedAt: string | null;
};

export type ProviderRequestSummary = {
  pending: number;
  awaitingPayment: number;
  confirmed: number;
  completed: number;
  total: number;
};

export type ProviderRequestListResult = {
  requests: ProviderRequestListItem[];
  summary: ProviderRequestSummary;
};

export type ProviderRequestStatusFilter =
  | "all"
  | ProviderRequestStatus;

export type ProviderRequestTypeFilter =
  | "all"
  | ProviderRequestType;

export type ProviderRequestFilter = "all" | "new" | "accepted" | "rejected" | "cancelled";
export type ProviderRequestFilters = {status: ProviderRequestFilter; search: string; cursor?: string | null};
export type ProviderRequestPage = {requests: ProviderRequestListItem[]; nextCursor: string | null; hasMore: boolean; skippedMalformedCount: number};
