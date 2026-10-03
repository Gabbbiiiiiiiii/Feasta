"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Users,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";

import {
  PageHeading,
} from "@/components/layout/page-heading";
import {
  StatusBadge,
} from "@/components/shared/status-badge";
import {
  Button,
} from "@/components/ui/button";
import {
  updateProviderAvailability,
} from "@/lib/provider/calendar/provider-calendar-client";

import type {
  ProviderCalendarData,
  ProviderCalendarEvent,
} from "@/lib/provider/calendar/provider-calendar-types";

type ProviderCalendarClientProps = {
  initialData: ProviderCalendarData;
};

const WEEKDAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function ProviderCalendarClient({
  initialData,
}: ProviderCalendarClientProps) {
  const router =
    useRouter();

  const today =
    useMemo(
      () => todayInManila(),
      [],
    );

  const initialDate =
    parseIsoDate(today);

  const [
    visibleMonth,
    setVisibleMonth,
  ] = useState(
    new Date(
      initialDate.getFullYear(),
      initialDate.getMonth(),
      1,
    ),
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(today);

  const [
    unavailableDates,
    setUnavailableDates,
  ] = useState(
    initialData.settings.unavailableDates,
  );

  const [
    actionPending,
    setActionPending,
  ] = useState(false);

  const [
    actionError,
    setActionError,
  ] = useState<string | null>(
    null,
  );

  const days =
    useMemo(
      () =>
        buildCalendarDays(
          visibleMonth,
        ),
      [visibleMonth],
    );

  const eventsByDate =
    useMemo(() => {
      const map =
        new Map<
          string,
          ProviderCalendarEvent[]
        >();

      for (
        const event of
        initialData.events
      ) {
        const current =
          map.get(
            event.event.eventDate,
          ) ?? [];

        current.push(event);

        map.set(
          event.event.eventDate,
          current,
        );
      }

      return map;
    }, [initialData.events]);

  const selectedEvents =
    eventsByDate.get(
      selectedDate,
    ) ?? [];

  const selectedDateObject =
    parseIsoDate(selectedDate);

  const selectedDayName =
    DAY_NAMES[
      selectedDateObject.getDay()
    ];

  const operatingDays =
    initialData.settings
      .operatingDays
      .map(
        (day) =>
          day
            .trim()
            .toLowerCase(),
      );

  const isOperatingDay =
    operatingDays.includes(
      selectedDayName,
    );

  const isManuallyUnavailable =
    unavailableDates.includes(
      selectedDate,
    );

  const capacity =
    initialData.settings
      .acceptsMultipleEventsPerDay
      ? initialData.settings
          .maxEventsPerDay
      : 1;

  const usedSlots =
    selectedEvents.length;

  const remainingSlots =
    Math.max(
      capacity - usedSlots,
      0,
    );

  const isFull =
    usedSlots >= capacity;

  const canManageAvailability =
    selectedDate >= today;

  async function handleAvailabilityToggle() {
    if (
      actionPending ||
      !canManageAvailability
    ) {
      return;
    }

    setActionPending(true);
    setActionError(null);

    try {
      const result =
        await updateProviderAvailability(
          {
            date: selectedDate,
            action:
              isManuallyUnavailable
                ? "mark_available"
                : "mark_unavailable",
          },
        );

      setUnavailableDates(
        result.unavailableDates,
      );

      router.refresh();
    } catch (error) {
      setActionError(
        calendarErrorMessage(
          error,
        ),
      );
    } finally {
      setActionPending(false);
    }
  }

  function previousMonth() {
    setVisibleMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() - 1,
          1,
        ),
    );
  }

  function nextMonth() {
    setVisibleMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + 1,
          1,
        ),
    );
  }

  function goToToday() {
    const date =
      parseIsoDate(today);

    setVisibleMonth(
      new Date(
        date.getFullYear(),
        date.getMonth(),
        1,
      ),
    );

    setSelectedDate(today);
  }

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Provider operations"
        title="Calendar"
        description={
          "Manage your business availability and review scheduled FEASTA events."
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={goToToday}
          >
            <CalendarDays className="size-4" />
            Today
          </Button>
        }
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Calendar settings"
      >
        <CalendarSummary
          label="Operating days"
          value={
            initialData.settings
              .operatingDays.length
          }
          description="days per week"
        />

        <CalendarSummary
          label="Booking lead time"
          value={
            initialData.settings
              .bookingLeadTimeDays
          }
          description="days minimum"
        />

        <CalendarSummary
          label="Daily capacity"
          value={capacity}
          description={
            capacity === 1
              ? "event per day"
              : "events per day"
          }
        />

        <CalendarSummary
          label="Blocked dates"
          value={
            unavailableDates.length
          }
          description="manually unavailable"
        />
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.8fr)]">
        <section className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
            <div>
              <h2 className="text-xl font-bold">
                {formatMonth(
                  visibleMonth,
                )}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Select a date to review
                events and availability.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Previous month"
                onClick={
                  previousMonth
                }
              >
                <ChevronLeft className="size-5" />
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Next month"
                onClick={nextMonth}
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>
          </header>

          <div className="overflow-x-auto">
            <div className="min-w-[42rem] p-4 sm:p-5">
              <div className="grid grid-cols-7 border-b border-border">
                {WEEKDAYS.map(
                  (weekday) => (
                    <div
                      key={weekday}
                      className="px-2 pb-3 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      {weekday}
                    </div>
                  ),
                )}
              </div>

              <div className="grid grid-cols-7">
                {days.map(
                  (day, index) => {
                    if (!day) {
                      return (
                        <div
                          key={`empty-${index}`}
                          className="min-h-28 border-b border-r border-border/70 bg-muted/20"
                        />
                      );
                    }

                    const dateKey =
                      toIsoDate(day);

                    const dayEvents =
                      eventsByDate.get(
                        dateKey,
                      ) ?? [];

                    const dayName =
                      DAY_NAMES[
                        day.getDay()
                      ];

                    const operating =
                      operatingDays.includes(
                        dayName,
                      );

                    const blocked =
                      unavailableDates.includes(
                        dateKey,
                      );

                    const selected =
                      dateKey ===
                      selectedDate;

                    const isToday =
                      dateKey === today;

                    const dayCapacity =
                      capacity;

                    const full =
                      dayEvents.length >=
                      dayCapacity;

                    return (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() =>
                          setSelectedDate(
                            dateKey,
                          )
                        }
                        aria-pressed={
                          selected
                        }
                        className={[
                          "relative min-h-28 border-b border-r border-border/70 p-2 text-left transition-colors",
                          "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "bg-secondary"
                            : "hover:bg-muted/50",
                          !operating ||
                          blocked
                            ? "bg-muted/30"
                            : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={[
                              "flex size-8 items-center justify-center rounded-full text-sm font-bold",
                              isToday
                                ? "bg-primary text-primary-foreground"
                                : "",
                            ].join(" ")}
                          >
                            {day.getDate()}
                          </span>

                          {blocked ? (
                            <span className="rounded-full bg-destructive/10 px-2 py-1 text-[10px] font-bold text-destructive">
                              Blocked
                            </span>
                          ) : !operating ? (
                            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                              Closed
                            </span>
                          ) : full ? (
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary-strong">
                              Full
                            </span>
                          ) : null}
                        </div>

                        {dayEvents.length >
                        0 ? (
                          <div className="mt-3 grid gap-1">
                            <span className="text-xs font-semibold text-foreground">
                              {
                                dayEvents.length
                              }{" "}
                              {dayEvents.length ===
                              1
                                ? "event"
                                : "events"}
                            </span>

                            <span className="text-[11px] text-muted-foreground">
                              {
                                Math.max(
                                  dayCapacity -
                                    dayEvents.length,
                                  0,
                                )
                              }{" "}
                              slots remaining
                            </span>
                          </div>
                        ) : null}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          </div>

          <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border p-4 text-xs text-muted-foreground sm:p-5">
            <Legend
              label="Today"
              className="bg-primary"
            />

            <Legend
              label="Selected"
              className="bg-secondary"
            />

            <Legend
              label="Blocked"
              className="bg-destructive/20"
            />

            <Legend
              label="Closed"
              className="bg-muted"
            />
          </footer>
        </section>

        <aside className="min-w-0 self-start rounded-card border border-border bg-card shadow-card">
          <header className="border-b border-border p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-strong">
              Selected date
            </p>

            <h2 className="mt-1 text-xl font-bold">
              {formatLongDate(
                selectedDate,
              )}
            </h2>
          </header>

          <div className="grid gap-6 p-5">
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Availability
              </h3>

              <div className="grid gap-3 rounded-lg border border-border p-4">
                <InfoRow
                  label="Operating day"
                  value={
                    isOperatingDay
                      ? "Yes"
                      : "No"
                  }
                />

                <InfoRow
                  label="Scheduled events"
                  value={`${usedSlots} / ${capacity}`}
                />

                <InfoRow
                  label="Remaining capacity"
                  value={
                    isFull
                      ? "Full"
                      : String(
                          remainingSlots,
                        )
                  }
                />

                <InfoRow
                  label="Manual status"
                  value={
                    isManuallyUnavailable
                      ? "Unavailable"
                      : "Available"
                  }
                />
              </div>

              {!canManageAvailability ? (
                <p className="text-sm text-muted-foreground">
                  Past dates cannot be
                  changed.
                </p>
              ) : null}

              {actionError ? (
                <p
                  className="text-sm font-medium text-destructive"
                  role="alert"
                >
                  {actionError}
                </p>
              ) : null}

              <Button
                type="button"
                variant={
                  isManuallyUnavailable
                    ? "secondary"
                    : "destructive"
                }
                size="compact"
                fullWidth
                disabled={
                  !canManageAvailability
                }
                loading={
                  actionPending
                }
                loadingLabel={
                  isManuallyUnavailable
                    ? "Restoring..."
                    : "Blocking..."
                }
                onClick={() => {
                  void handleAvailabilityToggle();
                }}
              >
                {isManuallyUnavailable
                  ? "Mark available"
                  : "Mark unavailable"}
              </Button>
            </section>

            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Scheduled events
                </h3>

                <span className="text-sm font-semibold">
                  {
                    selectedEvents.length
                  }
                </span>
              </div>

              {selectedEvents.length ===
              0 ? (
                <div className="rounded-lg border border-dashed border-border p-5 text-center">
                  <CalendarDays className="mx-auto size-8 text-muted-foreground" />

                  <p className="mt-3 font-semibold">
                    No scheduled events
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    There are no active
                    FEASTA events for this
                    date.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {selectedEvents.map(
                    (event) => (
                      <CalendarEventCard
                        key={event.id}
                        event={event}
                      />
                    ),
                  )}
                </div>
              )}
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CalendarSummary({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <section
      className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5"
      aria-label={label}
    >
      <p className="text-sm font-semibold text-muted-foreground">
        {label}
      </p>

      <p className="mt-3 text-3xl font-black tracking-tight">
        {value}
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        {description}
      </p>
    </section>
  );
}

function CalendarEventCard({
  event,
}: {
  event: ProviderCalendarEvent;
}) {
  return (
    <article className="grid gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {formatLabel(
              event.event.eventType,
            )}
          </p>

          <p className="mt-1 break-words text-sm text-muted-foreground">
            {event.customer.name}
          </p>
        </div>

        <StatusBadge
          status={event.status}
        />
      </div>

      {event.packageName ? (
        <p className="text-sm font-medium">
          {event.packageName}
        </p>
      ) : null}

      <div className="grid gap-2 text-sm text-muted-foreground">
        <EventDetail
          icon={
            <Clock3 className="size-4" />
          }
          value={
            event.event.eventTime ??
            "Time not provided"
          }
        />

        <EventDetail
          icon={
            <Users className="size-4" />
          }
          value={
            event.event.guestCount !==
            null
              ? `${event.event.guestCount.toLocaleString("en-PH")} guests`
              : "Guest count not provided"
          }
        />

        <EventDetail
          icon={
            <MapPin className="size-4" />
          }
          value={
            [
              event.event
                .venueAddress,
              event.event.city,
            ]
              .filter(Boolean)
              .join(", ") ||
            "Venue not provided"
          }
        />
      </div>
    </article>
  );
}

function EventDetail({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">
        {icon}
      </span>

      <span className="break-words">
        {value}
      </span>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">
        {label}
      </span>

      <span className="text-right font-semibold">
        {value}
      </span>
    </div>
  );
}

function Legend({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-3 rounded-full border border-border ${className}`}
      />

      {label}
    </span>
  );
}

function buildCalendarDays(
  month: Date,
): Array<Date | null> {
  const year =
    month.getFullYear();

  const monthIndex =
    month.getMonth();

  const firstDay =
    new Date(
      year,
      monthIndex,
      1,
    );

  const daysInMonth =
    new Date(
      year,
      monthIndex + 1,
      0,
    ).getDate();

  const result:
    Array<Date | null> = [];

  for (
    let index = 0;
    index < firstDay.getDay();
    index += 1
  ) {
    result.push(null);
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day += 1
  ) {
    result.push(
      new Date(
        year,
        monthIndex,
        day,
      ),
    );
  }

  while (
    result.length % 7 !== 0
  ) {
    result.push(null);
  }

  return result;
}

function todayInManila(): string {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone:
          "Asia/Manila",
      },
    ).formatToParts(
      new Date(),
    );

  const year =
    parts.find(
      (part) =>
        part.type === "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type === "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type === "day",
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new Error(
      "Unable to determine today's date.",
    );
  }

  return `${year}-${month}-${day}`;
}

function toIsoDate(
  date: Date,
): string {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, "0");

  const day =
    String(
      date.getDate(),
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseIsoDate(
  value: string,
): Date {
  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
  );
}

function formatMonth(
  date: Date,
): string {
  return new Intl.DateTimeFormat(
    "en-PH",
    {
      month: "long",
      year: "numeric",
    },
  ).format(date);
}

function formatLongDate(
  value: string,
): string {
  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "long",
    },
  ).format(
    parseIsoDate(value),
  );
}

function formatLabel(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function calendarErrorMessage(
  error: unknown,
): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message ===
      "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return (
    "We could not update your " +
    "availability. Please try again."
  );
}