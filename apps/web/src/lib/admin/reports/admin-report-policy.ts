import {
  ADMIN_REPORT_CURRENCY,
  ADMIN_REPORT_TIME_ZONE,
  DEFAULT_ADMIN_REPORT_FILTERS,
  type AdminReportComparison,
  type AdminReportDatePreset,
  type AdminReportFilters,
  type AdminReportGrouping,
  type AdminReportMetric,
  type AdminReportMoneyMetric,
  type AdminReportRateMetric,
  type AdminReportResolvedFilters,
  type AdminReportResolvedPeriod,
} from "@/lib/admin/reports/admin-report-types";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_DAYS = 366;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: ADMIN_REPORT_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const periodLabelFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: ADMIN_REPORT_TIME_ZONE,
});

type ManilaDateParts = {
  year: number;
  month: number;
  day: number;
};

export type AdminPaymentFinancialInput = {
  paidCount: number;
  paidAmountInCentavos: number;
  refundedCount: number;
  refundedAmountInCentavos: number;
  failedCount: number;
  expiredCount: number;
};

export type AdminPaymentFinancialSummary = {
  successfulPaymentAttempts: number;
  finalizedPaymentAttempts: number;
  grossCollectedVolumeInCentavos: number;
  confirmedPaymentVolumeInCentavos: number;
  providerAssociatedVolumeInCentavos: number;
  paymentSuccessRate: number;
  refundRate: number;
};

export function resolveAdminReportFilters(
  input: AdminReportFilters,
  now = new Date(),
): AdminReportResolvedFilters {
  if (Number.isNaN(now.getTime())) {
    throw new Error("The report generation time is invalid.");
  }

  const datePreset = validDatePreset(input.datePreset)
    ? input.datePreset
    : DEFAULT_ADMIN_REPORT_FILTERS.datePreset;
  const comparison = validComparison(input.comparison)
    ? input.comparison
    : DEFAULT_ADMIN_REPORT_FILTERS.comparison;
  const grouping = validGrouping(input.grouping)
    ? input.grouping
    : DEFAULT_ADMIN_REPORT_FILTERS.grouping;
  const period = resolvePeriod(datePreset, input.startDate, input.endDate, now);

  return {
    ...input,
    datePreset,
    comparison,
    grouping,
    startDate: datePreset === "custom" ? input.startDate : null,
    endDate: datePreset === "custom" ? input.endDate : null,
    period,
    comparisonPeriod: resolveComparisonPeriod(period, comparison),
  };
}

export function createAdminReportMetric(
  value: number,
  previousValue: number | null,
): AdminReportMetric {
  const current = safeFinite(value);
  const previous = previousValue === null ? null : safeFinite(previousValue);
  const comparisonAvailable = previous !== null && previous !== 0;
  const percentageChange = comparisonAvailable
    ? ((current - previous) / Math.abs(previous)) * 100
    : null;

  return {
    value: current,
    previousValue: previous,
    percentageChange,
    comparisonAvailable,
    trend: percentageChange === null
      ? "not_comparable"
      : percentageChange > 0
        ? "up"
        : percentageChange < 0
          ? "down"
          : "unchanged",
  };
}

export function createAdminReportMoneyMetric(
  valueInCentavos: number,
  previousValueInCentavos: number | null,
): AdminReportMoneyMetric {
  const current = safeCentavos(valueInCentavos);
  const previous = previousValueInCentavos === null
    ? null
    : safeCentavos(previousValueInCentavos);
  const metric = createAdminReportMetric(
    current / 100,
    previous === null ? null : previous / 100,
  );

  return {
    ...metric,
    valueInCentavos: current,
    previousValueInCentavos: previous,
    formattedValue: formatAdminReportCentavos(current),
    formattedPreviousValue:
      previous === null ? null : formatAdminReportCentavos(previous),
    currency: ADMIN_REPORT_CURRENCY,
  };
}

export function createAdminReportRateMetric(
  numerator: number,
  denominator: number,
  previousRate: number | null = null,
): AdminReportRateMetric {
  const safeNumerator = safeCount(numerator);
  const safeDenominator = safeCount(denominator);
  const value = safeDenominator === 0
    ? 0
    : (safeNumerator / safeDenominator) * 100;

  return {
    ...createAdminReportMetric(value, previousRate),
    numerator: safeNumerator,
    denominator: safeDenominator,
    formattedValue: `${value.toFixed(1)}%`,
  };
}

export function deriveAdminPaymentFinancials(
  input: AdminPaymentFinancialInput,
): AdminPaymentFinancialSummary {
  const paidCount = safeCount(input.paidCount);
  const refundedCount = safeCount(input.refundedCount);
  const failedCount = safeCount(input.failedCount);
  const expiredCount = safeCount(input.expiredCount);
  const paidAmount = safeCentavos(input.paidAmountInCentavos);
  const refundedAmount = safeCentavos(input.refundedAmountInCentavos);
  const successfulPaymentAttempts = paidCount + refundedCount;
  const finalizedPaymentAttempts =
    successfulPaymentAttempts + failedCount + expiredCount;
  const grossCollectedVolumeInCentavos = paidAmount + refundedAmount;

  return {
    successfulPaymentAttempts,
    finalizedPaymentAttempts,
    grossCollectedVolumeInCentavos,
    confirmedPaymentVolumeInCentavos: paidAmount,
    providerAssociatedVolumeInCentavos:
      Math.max(0, grossCollectedVolumeInCentavos - refundedAmount),
    paymentSuccessRate: percentage(
      successfulPaymentAttempts,
      finalizedPaymentAttempts,
    ),
    refundRate: percentage(refundedCount, successfulPaymentAttempts),
  };
}

export function formatAdminReportCentavos(valueInCentavos: number): string {
  return phpFormatter.format(safeCentavos(valueInCentavos) / 100);
}

function resolvePeriod(
  preset: AdminReportDatePreset,
  startDate: string | null,
  endDate: string | null,
  now: Date,
): AdminReportResolvedPeriod {
  const today = getManilaDateParts(now);
  let start: Date;
  let end: Date;

  switch (preset) {
    case "today":
      start = createManilaDate(today);
      end = addManilaDays(start, 1);
      break;
    case "last_7_days":
      end = addManilaDays(createManilaDate(today), 1);
      start = addManilaDays(end, -7);
      break;
    case "last_30_days":
      end = addManilaDays(createManilaDate(today), 1);
      start = addManilaDays(end, -30);
      break;
    case "last_3_months":
      start = createManilaDate({
        year: today.year,
        month: today.month - 2,
        day: 1,
      });
      end = createManilaDate({
        year: today.year,
        month: today.month + 1,
        day: 1,
      });
      break;
    case "this_year":
      start = createManilaDate({year: today.year, month: 0, day: 1});
      end = createManilaDate({year: today.year + 1, month: 0, day: 1});
      break;
    case "custom": {
      const customStart = parseIsoDate(startDate, "start date");
      const customEnd = parseIsoDate(endDate, "end date");
      start = createManilaDate(customStart);
      end = addManilaDays(createManilaDate(customEnd), 1);
      if (end.getTime() <= start.getTime()) {
        throw new Error("The report end date must be on or after its start date.");
      }
      if ((end.getTime() - start.getTime()) / DAY_MS > MAX_CUSTOM_DAYS) {
        throw new Error(`Custom reports are limited to ${MAX_CUSTOM_DAYS} days.`);
      }
      break;
    }
  }

  return createResolvedPeriod(start, end);
}

function resolveComparisonPeriod(
  period: AdminReportResolvedPeriod,
  comparison: AdminReportComparison,
): AdminReportResolvedPeriod | null {
  if (comparison === "none") return null;

  const start = new Date(period.startAt);
  const end = new Date(period.endAtExclusive);

  if (comparison === "previous_period") {
    const duration = end.getTime() - start.getTime();
    return createResolvedPeriod(
      new Date(start.getTime() - duration),
      start,
    );
  }

  return createResolvedPeriod(
    shiftManilaYear(start, -1),
    shiftManilaYear(end, -1),
  );
}

function createResolvedPeriod(start: Date, end: Date): AdminReportResolvedPeriod {
  return {
    startAt: start.toISOString(),
    endAtExclusive: end.toISOString(),
    label: `${periodLabelFormatter.format(start)} – ${periodLabelFormatter.format(
      new Date(end.getTime() - 1),
    )}`,
    timeZone: ADMIN_REPORT_TIME_ZONE,
  };
}

function parseIsoDate(value: string | null, label: string): ManilaDateParts {
  const match = value?.match(ISO_DATE);
  if (!match) throw new Error(`Enter a valid report ${label}.`);

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
  const canonical = getManilaDateParts(createManilaDate(parts));
  if (
    canonical.year !== parts.year ||
    canonical.month !== parts.month ||
    canonical.day !== parts.day
  ) {
    throw new Error(`Enter a valid report ${label}.`);
  }
  return parts;
}

function createManilaDate(parts: ManilaDateParts): Date {
  return new Date(
    Date.UTC(parts.year, parts.month, parts.day) - MANILA_OFFSET_MS,
  );
}

function getManilaDateParts(date: Date): ManilaDateParts {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function addManilaDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function shiftManilaYear(date: Date, years: number): Date {
  const parts = getManilaDateParts(date);
  const targetYear = parts.year + years;
  const lastDay = new Date(Date.UTC(targetYear, parts.month + 1, 0)).getUTCDate();
  return createManilaDate({
    year: targetYear,
    month: parts.month,
    day: Math.min(parts.day, lastDay),
  });
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function safeCentavos(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function safeFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function validDatePreset(value: string): value is AdminReportDatePreset {
  return [
    "today",
    "last_7_days",
    "last_30_days",
    "last_3_months",
    "this_year",
    "custom",
  ].includes(value);
}

function validComparison(value: string): value is AdminReportComparison {
  return ["none", "previous_period", "previous_year"].includes(value);
}

function validGrouping(value: string): value is AdminReportGrouping {
  return ["day", "week", "month"].includes(value);
}