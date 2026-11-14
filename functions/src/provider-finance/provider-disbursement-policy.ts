export const PROVIDER_DISBURSEMENT_POLICY_VERSION =
  1 as const;

export const ORDINARY_PROVIDER_PAYOUT_BANKING_DAYS =
  3 as const;

export const PAYMENT_DEFAULT_COMPENSATION_BANKING_DAYS =
  1 as const;

export const PROVIDER_PAYOUT_RELEASE_HOUR_MANILA =
  10 as const;

export type ProviderDisbursementTrigger =
  | "completed_booking"
  | "payment_default_compensation";

const MANILA_OFFSET_MS =
  8 * 60 * 60 * 1000;

const DATE_KEY =
  /^\d{4}-\d{2}-\d{2}$/u;

export function providerDisbursementEligibleAt(
  input: {
    anchor:
      Date;

    trigger:
      ProviderDisbursementTrigger;

    bankingHolidays?:
      readonly string[];
  },
): Date {
  if (
    !Number.isFinite(
      input.anchor.getTime(),
    )
  ) {
    throw new Error(
      "Provider disbursement anchor time is invalid.",
    );
  }

  const bankingDays =
    input.trigger ===
      "payment_default_compensation"
      ? PAYMENT_DEFAULT_COMPENSATION_BANKING_DAYS
      : ORDINARY_PROVIDER_PAYOUT_BANKING_DAYS;

  const holidays =
    new Set(
      parseProviderPayoutBankingHolidays(
        input.bankingHolidays ?? [],
      ),
    );

  let dateKey =
    manilaDateKey(
      input.anchor,
    );

  let counted =
    0;

  while (
    counted <
      bankingDays
  ) {
    dateKey =
      nextCalendarDateKey(
        dateKey,
      );

    if (
      isBankingDateKey(
        dateKey,
        holidays,
      )
    ) {
      counted += 1;
    }
  }

  return manilaReleaseInstant(
    dateKey,
  );
}

export function parseProviderPayoutBankingHolidays(
  value: unknown,
): string[] {
  if (
    value === undefined ||
    value === null
  ) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(
      "Provider payout banking holidays are invalid.",
    );
  }

  if (value.length > 100) {
    throw new Error(
      "Too many Provider payout banking holidays were configured.",
    );
  }

  const result =
    value.map((entry) => {
      if (
        typeof entry !== "string" ||
        !DATE_KEY.test(entry) ||
        !isRealCalendarDate(entry)
      ) {
        throw new Error(
          "Provider payout banking holiday is invalid.",
        );
      }

      return entry;
    });

  return [
    ...new Set(
      result,
    ),
  ].sort();
}

function manilaDateKey(
  value: Date,
): string {
  const shifted =
    new Date(
      value.getTime() +
        MANILA_OFFSET_MS,
    );

  return [
    shifted
      .getUTCFullYear()
      .toString()
      .padStart(4, "0"),

    String(
      shifted.getUTCMonth() + 1,
    ).padStart(2, "0"),

    String(
      shifted.getUTCDate(),
    ).padStart(2, "0"),
  ].join("-");
}

function nextCalendarDateKey(
  value: string,
): string {
  const [year, month, day] =
    numericDateParts(
      value,
    );

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day + 1,
      ),
    );

  return [
    date
      .getUTCFullYear()
      .toString()
      .padStart(4, "0"),

    String(
      date.getUTCMonth() + 1,
    ).padStart(2, "0"),

    String(
      date.getUTCDate(),
    ).padStart(2, "0"),
  ].join("-");
}

function isBankingDateKey(
  value: string,
  holidays:
    ReadonlySet<string>,
): boolean {
  if (
    holidays.has(
      value,
    )
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] =
    numericDateParts(
      value,
    );

  const weekDay =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    ).getUTCDay();

  return (
    weekDay !== 0 &&
    weekDay !== 6
  );
}

function manilaReleaseInstant(
  value: string,
): Date {
  const [
    year,
    month,
    day,
  ] =
    numericDateParts(
      value,
    );

  /*
   * Asia/Manila is UTC+08 and does not observe DST.
   *
   * 10:00 AM Manila = 02:00 UTC.
   */
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      PROVIDER_PAYOUT_RELEASE_HOUR_MANILA -
        8,
      0,
      0,
      0,
    ),
  );
}

function numericDateParts(
  value: string,
): [
  number,
  number,
  number,
] {
  if (
    !DATE_KEY.test(
      value,
    )
  ) {
    throw new Error(
      "Provider payout date is invalid.",
    );
  }

  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  return [
    year,
    month,
    day,
  ];
}

function isRealCalendarDate(
  value: string,
): boolean {
  const [
    year,
    month,
    day,
  ] =
    numericDateParts(
      value,
    );

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return (
    date.getUTCFullYear() ===
      year &&
    date.getUTCMonth() + 1 ===
      month &&
    date.getUTCDate() ===
      day
  );
}
