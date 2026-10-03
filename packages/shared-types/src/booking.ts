import type {
  MainEventStatus,
  ProviderRequestStatus,
  ProviderRequestType,
} from "./enums.js";

export type MainEvent = {
  id: string;

  customerId: string;

  eventType: string;
  eventDate: string;
  eventTime: string;
  guestCount: number;

  venueName: string | null;
  venueAddress: string;
  city: string;
  province: string;

  notes: string | null;

  status: MainEventStatus;

  estimatedTotal: number;
  currency: "PHP";

  createdAt: string | null;
  updatedAt: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
};

export type ProviderRequest = {
  id: string;

  mainEventId: string;
  customerId: string;
  providerId: string;

  type: ProviderRequestType;

  serviceId: string;
  serviceName: string;

  providerCategory: string | null;

  status: ProviderRequestStatus;

  amount: number;
  downPaymentAmount: number;
  downPaymentPercentage: number;

  rejectionReason: string | null;
  cancellationReason: string | null;

  createdAt: string | null;
  updatedAt: string | null;
  requestedAt: string | null;
  respondedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
};

export type CreateMainEventInput = {
  eventType: string;
  eventDate: string;
  eventTime: string;
  guestCount: number;

  venueName?: string | null;
  venueAddress: string;
  city: string;
  province: string;

  notes?: string | null;

  selections: CreateProviderRequestInput[];
};

export type CreateProviderRequestInput = {
  providerId: string;
  type: ProviderRequestType;

  serviceId: string;
  serviceName: string;

  providerCategory?: string | null;

  amount: number;
  downPaymentAmount: number;
  downPaymentPercentage: number;
};

export type CreateMainEventResult = {
  mainEventId: string;
  providerRequestIds: string[];
  status: MainEventStatus;
};