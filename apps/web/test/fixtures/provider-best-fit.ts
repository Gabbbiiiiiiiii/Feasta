import type {ProviderDiscoveryFilters, PublicProvider} from "@/lib/customer/providers/provider-types";

export const provider: PublicProvider = {
  id: "provider_0001", businessName: "Event Team", description: null, serviceType: "addon",
  primaryCategory: "photographer", categories: ["photographer"], location: "Ormoc City, Leyte",
  serviceAreas: ["Ormoc City, Leyte"], eventTypes: ["birthday"], operatingDays: [],
  bookingLeadTimeDays: 7, minimumGuests: 50, maximumGuests: 100,
  logoUrl: null, coverImageUrl: null, approvalLabel: "Approved", favoriteCount: 1,
};
export const filters: ProviderDiscoveryFilters = {
  search: "", serviceType: "all", category: "all", categories: ["photographer", "catering_service"], cursor: null,
  eventContext: {eventDate: "2099-09-10", eventTime: "18:00", eventEndTime: "22:00", guestCount: 100, serviceType: "all"},
  planningContext: {eventType: "birthday", guestCount: 100, budgetMin: 1000, budgetMax: 15000,
    eventVenue: {label: "Hall", address: "Ormoc City, Leyte", city: "Ormoc City", province: "Leyte", placeId: "place1234", latitude: 11, longitude: 124.6}},
};
