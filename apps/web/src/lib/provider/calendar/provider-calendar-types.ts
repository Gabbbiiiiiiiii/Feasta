export type ProviderCalendarEventStatus =
  | "pending"
  | "cancelled"
  | "expired"
  | "accepted"
  | "waiting_for_down_payment"
  | "payment_processing"
  | "confirmed"
  | "in_progress"
  | "completed";

export type ProviderCalendarEvent = {
  id: string;
  source: "online" | "walk_in";
  mainEventId: string | null;

  customer: {
    name: string;
  };

  event: {
    eventType: string;
    eventDate: string;
    eventTime: string | null;
    eventEndTime: string | null;
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
  ownerId?: string;
  month: string;
  settings: ProviderCalendarSettings;
  events: ProviderCalendarEvent[];
};
export type ProviderCalendarView = "month" | "week" | "agenda";

export function validProviderCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^(20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
