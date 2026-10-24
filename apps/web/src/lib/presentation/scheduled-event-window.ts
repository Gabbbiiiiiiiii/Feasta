/** Display only. Never authorizes booking or financial mutations. */
export function scheduledEventWindow(data: Readonly<Record<string, unknown>>): {start: number; end: number} | null {
  const date = (value: unknown): Date | null => {
    try {
      const parsed = value instanceof Date ? value : typeof value === "string" ? new Date(value) : (value as {toDate?: () => Date})?.toDate?.();
      return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
    } catch { return null; }
  };
  const day = date(data.eventDate);
  const clock = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
  if (!day || !clock(data.eventTime) || !clock(data.eventEndTime)) return null;
  const localDay = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"}).format(day);
  const start = Date.parse(localDay + "T" + data.eventTime + ":00+08:00");
  let end = Date.parse(localDay + "T" + data.eventEndTime + ":00+08:00");
  if (end <= start) end += 86_400_000;
  if (data.eventStartAt != null && date(data.eventStartAt)?.getTime() !== start) return null;
  return Number.isFinite(start) && Number.isFinite(end) ? {start, end} : null;
}
