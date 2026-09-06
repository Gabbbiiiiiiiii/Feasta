import {
  getProviderCalendarData,
} from "@/lib/provider/calendar/provider-calendar-service";

import {
  ProviderCalendarClient,
} from "./provider-calendar-client";

export default async function ProviderCalendarPage() {
  const data =
    await getProviderCalendarData();

  return (
    <ProviderCalendarClient
      initialData={data}
    />
  );
}