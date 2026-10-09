export type ProviderCalendarEventStatus =
  | "accepted"
  | "waiting_for_down_payment"
  | "payment_processing"
  | "confirmed"
  | "in_progress";

export type ProviderCalendarEvent = {
  id: string;
  mainEventId: string | null;

  customer: {
    name: string;
  };

  event: {
    eventType: string;
    eventDate: string;
    eventTime: string | null;
    guestCount: number | null;
    venueAddress: string | null;
    city: string | null;
  };

  packageName: string | null;
  status: ProviderCalendarEventStatus;
};

export type ProviderCalendarSettings = {
  operatingDays: string[];
  bookingLeadTimeDays: number;
  unavailableDates: string[];
  acceptsMultipleEventsPerDay: boolean;
  maxEventsPerDay: number;
};

export type ProviderCalendarData = {
  providerId: string;
  settings: ProviderCalendarSettings;
  events: ProviderCalendarEvent[];
};