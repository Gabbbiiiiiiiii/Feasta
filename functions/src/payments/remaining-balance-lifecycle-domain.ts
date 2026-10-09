import {frozenCanonicalBalanceTiming, canonicalBalanceSchedule, balanceDeadlineMessage} from "./canonical-balance-timing.js";
import {frozenBookingPolicyTimingV3, balanceStatusV3} from "../bookings/booking-policy-v3.js";
import {
  createHash,
} from "node:crypto";

import {
  remainingBalanceSchedule,
  type RemainingBalanceStatus,
} from "./remaining-balance-domain.js";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

export type RemainingBalanceReminderStage =
  | "due_soon"
  | "due"
  | "grace_period"
  | "overdue";

export type RemainingBalanceReminder = {
  stage:
    RemainingBalanceReminderStage;

  title: string;

  message: string;
};

export type RemainingBalanceLifecyclePlan = {
  currentStatus:
    RemainingBalanceStatus;

  nextStatus:
    RemainingBalanceStatus;

  changed: boolean;

  reminder:
    RemainingBalanceReminder |
    null;

  notificationId:
    string |
    null;

  dueAt: Date | null;

  graceEndsAt: Date | null;
};

const ACTIVE_STATUSES =
  new Set<RemainingBalanceStatus>([
    "not_due",
    "due_soon",
    "due",
    "grace_period",
    "overdue",
  ]);

const SETTLEMENT_READY_FOR_BALANCE_AGING =
  new Set([
    "deposit_settled",
    "balance_payment_processing",
    "fully_settled",
  ]);

export function remainingBalanceLifecyclePlan(
  input: {
    providerRequestId: string;

    providerRequest:
      UnknownRecord;

    now: Date;
  },
): RemainingBalanceLifecyclePlan | null {
  assertDate(
    input.now,
    "Current time",
  );

  const request =
    input.providerRequest;

  if (
    request.remainingBalanceTimingSchemaVersion !== 3 &&
    request.remainingBalanceTimingSchemaVersion !== 2 &&
    request.remainingBalanceTimingSchemaVersion !==
      1
  ) {
    return null;
  }

  const currentStatus =
    parseRemainingBalanceStatus(
      request.remainingBalanceStatus,
    );

  if (
    !currentStatus ||
    !ACTIVE_STATUSES.has(
      currentStatus,
    )
  ) {
    return null;
  }

  /*
   * Remaining-balance reminders begin only after the Provider
   * request has reached confirmed booking lifecycle.
   *
   * The initial deposit flow remains independent.
   */
  if (
    request.status !==
      "confirmed"
  ) {
    return null;
  }

  if (
    !SETTLEMENT_READY_FOR_BALANCE_AGING.has(
      String(
        request.settlementStatus ??
          "",
      ),
    )
  ) {
    return null;
  }

  const financial =
    recordValue(
      request.financialSnapshot,
    );

  if (
    !financial ||
    financial.schemaVersion !==
      1 ||
    financial.currency !==
      "PHP"
  ) {
    throw new Error(
      "Remaining-balance financial snapshot is invalid.",
    );
  }

  const remainingBalanceInCentavos =
    nonNegativeInteger(
      financial
        .remainingBalanceInCentavos,

      "Remaining balance",
    );

  const outstandingAmountInCentavos =
    nonNegativeInteger(
      request
        .outstandingAmountInCentavos,

      "Outstanding balance",
    );

  /*
   * Once the minimum payment has settled, the outstanding amount
   * cannot exceed the immutable remaining-balance obligation.
   */
  if (
    outstandingAmountInCentavos >
      remainingBalanceInCentavos
  ) {
    throw new Error(
      "Remaining-balance settlement projection is inconsistent.",
    );
  }

  const settledBalanceInCentavos =
    remainingBalanceInCentavos -
    outstandingAmountInCentavos;

  if (request.remainingBalanceTimingSchemaVersion === 3) {
    const timing = frozenBookingPolicyTimingV3(request);
    const status = balanceStatusV3({...timing, now: input.now, outstandingAmountInCentavos});
    const nextStatus = status === "payment_confirmation_hold" ? "overdue" : status;
    const changed = nextStatus !== currentStatus;
    const dueNotification = changed && currentStatus === "not_due" && input.now >= timing.remainingBalanceDueAt &&
      input.now < timing.hardPaymentDeadlineAt && outstandingAmountInCentavos > 0;
    const reminder: RemainingBalanceReminder | null = dueNotification ? {stage: "due", title: "Remaining balance now due",
      message: "Your remaining balance is now due. " + balanceDeadlineMessage(outstandingAmountInCentavos,
        timing.hardPaymentDeadlineAt).replace("is due on", "must be paid by") + " Pay by this deadline to keep your booking confirmed."} : null;
    return {currentStatus, nextStatus, changed, reminder,
      notificationId: reminder ? remainingBalanceNotificationId(input.providerRequestId, "due") : null,
      dueAt: timing.remainingBalanceDueAt, graceEndsAt: timing.hardPaymentDeadlineAt};
  }
  if (request.remainingBalanceTimingSchemaVersion === 2) {
    const timing = frozenCanonicalBalanceTiming(request);
    const schedule = canonicalBalanceSchedule({...timing, remainingAmountInCentavos: outstandingAmountInCentavos, now: input.now});
    const changed = schedule.status !== currentStatus;
    const stage = schedule.status === "due_soon" || schedule.status === "due" ? schedule.status : null;
    const reminder = changed && stage ? {
      stage, title: stage === "due_soon" ? "Remaining balance due tomorrow" : "Remaining balance due now",
      message: balanceDeadlineMessage(outstandingAmountInCentavos, timing.dueAt),
    } : null;
    return {currentStatus, nextStatus: schedule.status, changed, reminder,
      notificationId: reminder ? remainingBalanceNotificationId(input.providerRequestId, reminder.stage) : null,
      dueAt: timing.dueAt, graceEndsAt: null};
  }

  const eventDate =
    timestampDate(
      request.eventDate,
    );

  const storedDueAt =
    timestampDate(
      request.remainingBalanceDueAt,
    );

  const storedGraceEndsAt =
    timestampDate(
      request.remainingBalanceGraceEndsAt,
    );

  if (
    !eventDate ||
    !storedDueAt ||
    !storedGraceEndsAt
  ) {
    throw new Error(
      "Remaining-balance timing snapshot is invalid.",
    );
  }

  const balanceDueDaysBeforeEvent =
    boundedInteger(
      request.balanceDueDaysBeforeEvent,
      0,
      365,
      "Balance due days",
    );

  const dueSoonWindowDays =
    boundedInteger(
      request.remainingBalanceDueSoonWindowDays,
      0,
      30,
      "Due-soon window",
    );

  const gracePeriodDays =
    boundedInteger(
      request.remainingBalanceGracePeriodDays,
      0,
      30,
      "Grace period",
    );

  const schedule =
    remainingBalanceSchedule({
      eventDate,

      balanceDueDaysBeforeEvent,

      remainingBalanceInCentavos,

      settledBalanceInCentavos,

      cancelled:
        false,

      now:
        input.now,

      policy: {
        dueSoonWindowDays,
        gracePeriodDays,
      },
    });

  /*
   * The scheduler never invents new timing.
   * Acceptance already froze the canonical dates.
   */
  if (
    schedule.dueAt &&
    schedule.dueAt.getTime() !==
      storedDueAt.getTime()
  ) {
    throw new Error(
      "Remaining-balance due date requires reconciliation.",
    );
  }

  if (
    schedule.graceEndsAt &&
    schedule.graceEndsAt.getTime() !==
      storedGraceEndsAt.getTime()
  ) {
    throw new Error(
      "Remaining-balance grace boundary requires reconciliation.",
    );
  }

  const changed =
    schedule.status !==
      currentStatus;

  const reminder =
    changed
      ? remainingBalanceReminder(
          schedule.status,
        )
      : null;

  return {
    currentStatus,

    nextStatus:
      schedule.status,

    changed,

    reminder,

    notificationId:
      reminder
        ? remainingBalanceNotificationId(
            input.providerRequestId,
            reminder.stage,
          )
        : null,

    dueAt:
      schedule.dueAt,

    graceEndsAt:
      schedule.graceEndsAt,
  };
}

export function remainingBalanceReminder(
  status: RemainingBalanceStatus,
): RemainingBalanceReminder | null {
  switch (status) {
    case "due_soon":
      return {
        stage:
          "due_soon",

        title:
          "Remaining balance due soon",

        message:
          "Your remaining balance is due soon. You may complete it from your FEASTA booking.",
      };

    case "due":
      return {
        stage:
          "due",

        title:
          "Remaining balance due today",

        message:
          "Your remaining balance is due today. Complete the payment from your FEASTA booking.",
      };

    case "grace_period":
      return {
        stage:
          "grace_period",

        title:
          "Remaining balance grace period",

        message:
          "Your remaining balance is past due and is now within the " +
          "grace period. Complete payment before the grace period ends.",
      };

    case "overdue":
      return {
        stage:
          "overdue",

        title:
          "Remaining balance overdue",

        message:
          "Your remaining balance is overdue. Complete payment from your " +
          "FEASTA booking as soon as possible.",
      };

    default:
      return null;
  }
}

export function remainingBalanceNotificationId(
  providerRequestId: string,

  stage:
    RemainingBalanceReminderStage,
): string {
  if (
    typeof providerRequestId !==
      "string" ||
    providerRequestId.length < 1 ||
    providerRequestId.length > 200
  ) {
    throw new Error(
      "Provider request ID is invalid.",
    );
  }

  const digest =
    createHash("sha256")
      .update(
        `${providerRequestId}:${stage}`,
      )
      .digest("hex")
      .slice(
        0,
        32,
      );

  return (
    `remaining_balance_${stage}_` +
    digest
  );
}

function parseRemainingBalanceStatus(
  value: unknown,
): RemainingBalanceStatus | null {
  switch (value) {
    case "not_applicable":
    case "not_due":
    case "due_soon":
    case "due":
    case "overdue":
    case "grace_period":
    case "paid":
    case "cancelled":
      return value;

    default:
      return null;
  }
}

function timestampDate(
  value: unknown,
): Date | null {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const candidate =
    value as {
      toDate?: unknown;
    };

  if (
    typeof candidate.toDate !==
      "function"
  ) {
    return null;
  }

  const date =
    (
      candidate.toDate as
        () => unknown
    )();

  return date instanceof Date &&
    Number.isFinite(
      date.getTime(),
    )
    ? date
    : null;
}

function recordValue(
  value: unknown,
): UnknownRecord | null {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as UnknownRecord
    : null;
}

function nonNegativeInteger(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return value;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const result =
    nonNegativeInteger(
      value,
      label,
    );

  if (
    result < minimum ||
    result > maximum
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return result;
}

function assertDate(
  value: Date,
  label: string,
): void {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(
      value.getTime(),
    )
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }
}
