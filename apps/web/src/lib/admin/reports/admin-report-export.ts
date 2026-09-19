import type {
  AdminReportResult,
} from "@/lib/admin/reports/admin-report-types";

const MANILA_TIME_ZONE = "Asia/Manila";

export type AdminReportCsvExport = {
  content: string;
  fileName: string;
  mimeType: "text/csv;charset=utf-8";
};

export function createAdminReportCsv(
  report: AdminReportResult,
): AdminReportCsvExport {
  const rows: string[][] = [];

  section(rows, "FEASTA ADMINISTRATIVE REPORT");
  addRows(rows, [
    ["Generated at", formatManilaDateTime(report.generatedAt)],
    ["Reporting period", report.filters.period.label],
    ["Period start", formatManilaDateTime(report.filters.period.startAt)],
    ["Period end (exclusive)", formatManilaDateTime(report.filters.period.endAtExclusive)],
    ["Comparison period", report.filters.comparisonPeriod?.label ?? "None"],
    ["Grouping", titleCase(report.filters.grouping)],
    ["Time zone", report.timeZone],
    ["Currency", report.currency],
    ["Data source", "Authorized server-generated bounded operational data"],
  ]);

  section(rows, "APPLIED FILTERS");
  addRows(rows, [
    ["Date preset", titleCase(report.filters.datePreset)],
    ["Provider service type", titleCase(report.filters.providerServiceType)],
    ["Provider request type", titleCase(report.filters.providerRequestType)],
    ["Event type", titleCase(report.filters.eventType)],
    ["City", report.filters.city],
    ["Booking status", titleCase(report.filters.bookingStatus)],
    ["Payment status", titleCase(report.filters.paymentStatus)],
  ]);

  section(rows, "EXECUTIVE OVERVIEW");
  rows.push(["Metric", "Current value", "Previous value", "Change (%)"]);
  executiveMetric(rows, "Total bookings", report.executive.totalBookings);
  executiveMetric(rows, "Confirmed bookings", report.executive.confirmedBookings);
  executiveMetric(rows, "Completed events", report.executive.completedEvents);
  executiveMetric(rows, "Cancellation rate", report.executive.cancellationRate, true);
  executiveMetric(rows, "Active customers", report.executive.activeCustomers);
  executiveMetric(rows, "Active providers", report.executive.activeProviders);
  moneyMetric(rows, "Confirmed payment volume", report.executive.confirmedPaymentVolume);
  moneyMetric(rows, "Average paid payment", report.executive.averagePaidPayment);

  section(rows, "BOOKING STATUS DISTRIBUTION");
  rows.push(["Status", "Count", "Share (%)"]);
  for (const point of report.bookings.statusDistribution) {
    rows.push([titleCase(point.status), String(point.count), decimal(point.percentage)]);
  }

  section(rows, "BOOKING ACTIVITY BY PERIOD");
  rows.push([
    "Period",
    "Created",
    "Confirmed",
    "Completed",
    "Cancelled",
    "Expired",
  ]);
  for (const point of report.bookings.trend) {
    rows.push([
      point.label,
      String(point.created),
      String(point.confirmed),
      String(point.completed),
      String(point.cancelled),
      String(point.expired),
    ]);
  }

  section(rows, "PROVIDER REQUEST OUTCOMES");
  rows.push(["Status", "Count", "Share (%)"]);
  for (const point of report.bookings.providerRequests.byStatus) {
    rows.push([titleCase(point.status), String(point.count), decimal(point.percentage)]);
  }
  rows.push([]);
  rows.push(["Acceptance rate", report.bookings.providerRequests.acceptanceRate.formattedValue]);
  rows.push(["Rejection rate", report.bookings.providerRequests.rejectionRate.formattedValue]);
  rows.push([
    "Average response time (minutes)",
    nullableDecimal(report.bookings.providerRequests.averageResponseTimeInMinutes),
  ]);
  rows.push([
    "Average booking lead time (days)",
    nullableDecimal(report.bookings.averageLeadTimeInDays),
  ]);

  section(rows, "PAYMENT PERFORMANCE");
  rows.push(["Metric", "Value"]);
  addRows(rows, [
    ["Created payments", String(report.payments.createdPayments.value)],
    ["Successful payment attempts", String(report.payments.successfulPaymentAttempts.value)],
    ["Currently paid payments", String(report.payments.currentlyPaidPayments.value)],
    ["Gross collected volume (PHP)", centavos(report.payments.grossCollectedVolume.valueInCentavos)],
    ["Confirmed payment volume (PHP)", centavos(report.payments.confirmedPaymentVolume.valueInCentavos)],
    ["Provider-associated volume (PHP)", centavos(report.payments.providerAssociatedVolume.valueInCentavos)],
    ["Refunded amount (PHP)", centavos(report.payments.refundedAmount.valueInCentavos)],
    ["Average paid payment (PHP)", centavos(report.payments.averagePaidPayment.valueInCentavos)],
    ["Pending or processing", String(report.payments.pendingOrProcessing.value)],
    ["Failed or expired", String(report.payments.failedOrExpired.value)],
    ["Awaiting webhook confirmation", String(report.payments.awaitingWebhookConfirmation.value)],
    ["Payment success rate", report.payments.paymentSuccessRate.formattedValue],
    ["Refund rate", report.payments.refundRate.formattedValue],
    ["FEASTA platform revenue", "Not configured"],
    ["Platform revenue note", report.payments.platformRevenue.explanation],
  ]);

  section(rows, "PAYMENTS BY STATUS");
  rows.push(["Status", "Count", "Amount (PHP)"]);
  for (const point of report.payments.byStatus) {
    rows.push([titleCase(point.status), String(point.count), centavos(point.amountInCentavos)]);
  }

  section(rows, "PAYMENTS BY TYPE");
  rows.push(["Payment type", "Count", "Amount (PHP)"]);
  for (const point of report.payments.byType) {
    rows.push([titleCase(point.paymentType), String(point.count), centavos(point.amountInCentavos)]);
  }

  section(rows, "PAYMENT ACTIVITY BY PERIOD");
  rows.push([
    "Period",
    "Created",
    "Successful",
    "Failed/expired",
    "Refunded",
    "Gross collected (PHP)",
    "Currently paid (PHP)",
    "Refunded amount (PHP)",
    "Provider-associated volume (PHP)",
  ]);
  for (const point of report.payments.trend) {
    rows.push([
      point.label,
      String(point.createdPayments),
      String(point.successfulPayments),
      String(point.failedOrExpiredPayments),
      String(point.refundedPayments),
      centavos(point.collectedVolumeInCentavos),
      centavos(point.currentlyPaidVolumeInCentavos),
      centavos(point.refundedAmountInCentavos),
      centavos(point.netProviderAssociatedVolumeInCentavos),
    ]);
  }

  section(rows, "PROVIDER PERFORMANCE");
  rows.push([
    "Provider ID",
    "Provider",
    "Service type",
    "Category",
    "Requests",
    "Accepted",
    "Rejected",
    "Confirmed",
    "Completed",
    "Cancelled",
    "Acceptance rate (%)",
    "Rejection rate (%)",
    "Cancellation rate (%)",
    "Average response (minutes)",
    "Average rating",
    "Published reviews",
    "Rating qualified",
    "Confirmed payment volume (PHP)",
  ]);
  for (const provider of report.providers.providers) {
    rows.push([
      provider.providerId,
      provider.providerName,
      titleCase(provider.serviceType),
      provider.providerCategory ? titleCase(provider.providerCategory) : "Not specified",
      String(provider.requestsReceived),
      String(provider.acceptedRequests),
      String(provider.rejectedRequests),
      String(provider.confirmedBookings),
      String(provider.completedEvents),
      String(provider.cancelledRequests),
      decimal(provider.acceptanceRate),
      decimal(provider.rejectionRate),
      decimal(provider.cancellationRate),
      nullableDecimal(provider.averageResponseTimeInMinutes),
      decimal(provider.averageRating),
      String(provider.publishedReviewCount),
      provider.publishedReviewCount >= report.providers.minimumReviewsForRatingRanking
        ? "Yes"
        : "No",
      centavos(provider.confirmedPaymentVolumeInCentavos),
    ]);
  }

  section(rows, "METRIC DEFINITIONS");
  rows.push(["Metric", "Definition"]);
  for (const definition of report.definitions) {
    rows.push([definition.label, definition.description]);
  }

  const content = `\uFEFF${rows.map(csvRow).join("\r\n")}\r\n`;
  return {
    content,
    fileName: reportFileName(report),
    mimeType: "text/csv;charset=utf-8",
  };
}

export function reportFileName(report: AdminReportResult): string {
  const start = manilaDate(report.filters.period.startAt);
  const inclusiveEnd = manilaDate(
    new Date(new Date(report.filters.period.endAtExclusive).getTime() - 1).toISOString(),
  );
  return `feasta-admin-report-${start}-to-${inclusiveEnd}.csv`;
}

export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const protectedValue = /^[=+\-@\t\r]/u.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function csvRow(row: string[]): string {
  return row.map(escapeCsvCell).join(",");
}

function section(rows: string[][], title: string): void {
  if (rows.length > 0) rows.push([]);
  rows.push([title]);
}

function addRows(rows: string[][], additions: string[][]): void {
  rows.push(...additions);
}

function executiveMetric(
  rows: string[][],
  label: string,
  metric: AdminReportResult["executive"]["totalBookings"],
  rate = false,
): void {
  rows.push([
    label,
    rate ? `${decimal(metric.value)}%` : String(metric.value),
    metric.previousValue === null
      ? "Not comparable"
      : rate ? `${decimal(metric.previousValue)}%` : String(metric.previousValue),
    metric.percentageChange === null ? "Not comparable" : decimal(metric.percentageChange),
  ]);
}

function moneyMetric(
  rows: string[][],
  label: string,
  metric: AdminReportResult["executive"]["confirmedPaymentVolume"],
): void {
  rows.push([
    label,
    metric.formattedValue,
    metric.formattedPreviousValue ?? "Not comparable",
    metric.percentageChange === null ? "Not comparable" : decimal(metric.percentageChange),
  ]);
}

function centavos(value: number): string {
  return (value / 100).toFixed(2);
}

function decimal(value: number): string {
  return value.toFixed(2);
}

function nullableDecimal(value: number | null): string {
  return value === null ? "Not available" : decimal(value);
}

function titleCase(value: string): string {
  if (value === "all") return "All";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function manilaDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatManilaDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}