import {
  getProviderCalendarData,
} from "@/lib/provider/calendar/provider-calendar-service";

import {
  ProviderCalendarClient,
} from "./provider-calendar-client";

export default async function ProviderCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : undefined;
  const data = await getProviderCalendarData(month);

  return (
    <ProviderCalendarClient
      key={data.month}
      initialData={data}
    />
  );
}