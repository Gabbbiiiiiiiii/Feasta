export const REMAINING_BALANCE_STATUSES = [
  "not_applicable",
  "not_due",
  "due_soon",
  "due",
  "overdue",
  "grace_period",
  "paid",
  "cancelled",
] as const;

export type RemainingBalanceStatus =
  typeof REMAINING_BALANCE_STATUSES[number];

export type RemainingBalanceTimingPolicy = {
  dueSoonWindowDays: number;
  gracePeriodDays: number;
};

export const DEFAULT_REMAINING_BALANCE_TIMING_POLICY:
Readonly<RemainingBalanceTimingPolicy> = {
  dueSoonWindowDays: 3,
  gracePeriodDays: 2,
};

export type RemainingBalanceScheduleInput = {
  eventDate: Date;
  balanceDueDaysBeforeEvent: number;
  remainingBalanceInCentavos: number;
  settledBalanceInCentavos: number;
  cancelled: boolean;
  now: Date;
  policy: RemainingBalanceTimingPolicy;
};

export type RemainingBalanceSchedule = {
  status: RemainingBalanceStatus;
  remainingAmountInCentavos: number;
  dueAt: Date | null;
  graceEndsAt: Date | null;
  eventStartsOn: string;
};

export function remainingBalanceSchedule(
  input: RemainingBalanceScheduleInput,
): RemainingBalanceSchedule {
  assertDate(input.eventDate, "Event date");
  assertDate(input.now, "Current time");

  const remainingBalanceInCentavos =
    nonNegativeInteger(
      input.remainingBalanceInCentavos,
      "Remaining balance",
    );

  const settledBalanceInCentavos =
    nonNegativeInteger(
      input.settledBalanceInCentavos,
      "Settled balance",
    );

  const balanceDueDaysBeforeEvent =
    boundedDays(
      input.balanceDueDaysBeforeEvent,
      0,
      365,
      "Balance due days before event",
    );

  const dueSoonWindowDays =
    boundedDays(
      input.policy.dueSoonWindowDays,
      0,
      30,
      "Due-soon window",
    );

  const gracePeriodDays =
    boundedDays(
      input.policy.gracePeriodDays,
      0,
      30,
      "Grace period",
    );

  if (
    settledBalanceInCentavos >
      remainingBalanceInCentavos
  ) {
    throw new Error(
      "Settled balance cannot exceed the authoritative remaining balance.",
    );
  }

  const eventParts =
    manilaCalendarParts(
      input.eventDate,
    );

  const eventStartsAt =
    manilaMidnight(
      eventParts.year,
      eventParts.month,
      eventParts.day,
    );

  const dueAt =
    shiftManilaCalendarDays(
      eventStartsAt,
      -balanceDueDaysBeforeEvent,
    );

  /*
   * graceEndsAt is an EXCLUSIVE Manila-calendar boundary.
   *
   * Example:
   * dueAt = Oct 13 00:00
   * gracePeriodDays = 2
   *
   * Oct 13         -> due
   * Oct 14 + 15    -> grace_period
   * Oct 16 00:00   -> overdue
   *
   * Adding one extra calendar day preserves the entire due date
   * plus exactly gracePeriodDays full grace days.
   */
  const graceEndsAt =
    shiftManilaCalendarDays(
      dueAt,
      gracePeriodDays + 1,
    );

  const remainingAmountInCentavos =
    remainingBalanceInCentavos -
    settledBalanceInCentavos;

  const eventStartsOn =
    manilaCalendarDateString(
      eventStartsAt,
    );

  if (
    remainingBalanceInCentavos === 0
  ) {
    return {
      status: "not_applicable",
      remainingAmountInCentavos: 0,
      dueAt: null,
      graceEndsAt: null,
      eventStartsOn,
    };
  }

  if (input.cancelled) {
    return {
      status: "cancelled",
      remainingAmountInCentavos,
      dueAt,
      graceEndsAt,
      eventStartsOn,
    };
  }

  if (remainingAmountInCentavos === 0) {
    return {
      status: "paid",
      remainingAmountInCentavos: 0,
      dueAt,
      graceEndsAt,
      eventStartsOn,
    };
  }

  const now =
    input.now.getTime();

  const due =
    dueAt.getTime();

  const graceEnd =
    graceEndsAt.getTime();

  if (now < due) {
    const dueSoonStartsAt =
      shiftManilaCalendarDays(
        dueAt,
        -dueSoonWindowDays,
      );

    return {
      status:
        now >= dueSoonStartsAt.getTime()
          ? "due_soon"
          : "not_due",
      remainingAmountInCentavos,
      dueAt,
      graceEndsAt,
      eventStartsOn,
    };
  }

  if (
    manilaCalendarDateString(
      input.now,
    ) ===
    manilaCalendarDateString(
      dueAt,
    )
  ) {
    return {
      status: "due",
      remainingAmountInCentavos,
      dueAt,
      graceEndsAt,
      eventStartsOn,
    };
  }

  if (now < graceEnd) {
    return {
      status:
        gracePeriodDays > 0
          ? "grace_period"
          : "overdue",
      remainingAmountInCentavos,
      dueAt,
      graceEndsAt,
      eventStartsOn,
    };
  }

  return {
    status: "overdue",
    remainingAmountInCentavos,
    dueAt,
    graceEndsAt,
    eventStartsOn,
  };
}

export function remainingBalanceCheckoutReason(
  input: {
    schedule: RemainingBalanceSchedule;
    hasConflictingCheckout: boolean;
    cancellationActive: boolean;
  },
): string | null {
  if (
    input.schedule.status ===
      "not_applicable" ||
    input.schedule.status ===
      "paid"
  ) {
    return "remaining_balance_not_payable";
  }

  if (
    input.schedule.status ===
      "cancelled" ||
    input.cancellationActive
  ) {
    return "cancellation_in_progress";
  }

  if (input.hasConflictingCheckout) {
    return "remaining_balance_checkout_exists";
  }

  return null;
}

function manilaCalendarParts(
  value: Date,
): {
  year: number;
  month: number;
  day: number;
} {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(value);

  const values =
    new Map(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  const year =
    Number(values.get("year"));

  const month =
    Number(values.get("month"));

  const day =
    Number(values.get("day"));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(
      "Could not resolve Manila calendar date.",
    );
  }

  return {
    year,
    month,
    day,
  };
}

function manilaMidnight(
  year: number,
  month: number,
  day: number,
): Date {
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      -8,
      0,
      0,
      0,
    ),
  );
}

function shiftManilaCalendarDays(
  value: Date,
  days: number,
): Date {
  const parts =
    manilaCalendarParts(value);

  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + days,
      -8,
      0,
      0,
      0,
    ),
  );
}

function manilaCalendarDateString(
  value: Date,
): string {
  const parts =
    manilaCalendarParts(value);

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function assertDate(
  value: Date,
  label: string,
): void {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(value.getTime())
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }
}

function nonNegativeInteger(
  value: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} must be a non-negative integer.`,
    );
  }

  return value;
}

function boundedDays(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${label} must be between ${minimum} and ${maximum} days.`,
    );
  }

  return value;
}