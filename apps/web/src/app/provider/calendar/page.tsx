import {validProviderCalendarDate, type ProviderCalendarView} from "@/lib/provider/calendar/provider-calendar-types";
import {
  getProviderCalendarData,
} from "@/lib/provider/calendar/provider-calendar-service";

import {
  ProviderCalendarClient,
} from "./provider-calendar-client";

export default async function ProviderCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[]; date?: string; view?: string; booking?: string }>;
}) {
  const params = await searchParams;
  const date = validProviderCalendarDate(params.date) ? params.date : undefined;
  const month = date?.slice(0, 7) ?? (typeof params.month === "string" ? params.month : undefined);
  const view: ProviderCalendarView = params.view === "week" || params.view === "agenda" ? params.view : "month";
  const booking = typeof params.booking === "string" ? params.booking : undefined;
  const data = await getProviderCalendarData(month);

  return (
    <ProviderCalendarClient
      key={`${data.month}:${date ?? ""}:${view}:${booking ?? ""}`}
      initialSelectedDate={date}
      initialView={view}
      highlightBooking={booking}
      initialData={data}
    />
  );
}