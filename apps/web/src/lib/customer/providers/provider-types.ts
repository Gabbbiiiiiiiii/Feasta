import type {
  ProviderServiceCategory,
  ProviderServiceType,
} from "@feasta/shared-types";
import type {
  CustomerEventContext,
  CustomerPlanningContext,
} from "@/lib/customer/planning/event-planning-context";

export type ProviderDiscoveryFilters = {
  search: string;
  serviceType: ProviderServiceType | "all";
  category: ProviderServiceCategory | "all";
  cursor: string | null;
  eventContext?: CustomerEventContext | null;
  planningContext?: CustomerPlanningContext | null;
};

export type PublicProvider = {
  id: string;
  businessName: string;
  description: string | null;
  serviceType: ProviderServiceType;
  primaryCategory: ProviderServiceCategory | null;
  categories: readonly ProviderServiceCategory[];
  location: string | null;
  serviceAreas: readonly string[];
  eventTypes: readonly string[];
  operatingDays: readonly string[];
  bookingLeadTimeDays: number | null;
  minimumGuests: number | null;
  maximumGuests: number | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  approvalLabel: "Approved";
  /** Existing aggregate maintained by the canonical customer favorite transaction. */
  favoriteCount?: number | null;
};

export type ProviderDiscoveryPage = {
  providers: readonly PublicProvider[];
  previousCursor: string | null;
  nextCursor: string | null;
  pageSize: number;
};

export type ProviderCursorDirection = "next" | "previous";

export type ProviderCursor = {
  direction: ProviderCursorDirection;
  favoriteCount: number;
  providerId: string;
};
