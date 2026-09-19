import type {
  Cell,
  Row,
  Worksheet,
} from "exceljs";

import type {
  AdminReportResult,
} from "@/lib/admin/reports/admin-report-types";

const EXCEL_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ORANGE = "FFFF5F35";
const DARK = "FF241A17";
const LIGHT = "FFFFF4EF";
const BORDER = "FFE7DDD8";
const MUTED = "FF6F625D";

export type AdminReportExcelExport = {
  blob: Blob;
  fileName: string;
};

export async function createAdminReportExcel(
  report: AdminReportResult,
): Promise<AdminReportExcelExport> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FEASTA Administration";
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);
  workbook.subject = `Administrative report for ${report.filters.period.label}`;
  workbook.title = "FEASTA Reports and Insights";

  buildSummarySheet(workbook.addWorksheet("Executive Summary"), report);
  buildBookingSheet(workbook.addWorksheet("Booking Performance"), report);
  buildPaymentSheet(workbook.addWorksheet("Payment Performance"), report);
  buildProviderSheet(workbook.addWorksheet("Provider Performance"), report);
  buildDefinitionsSheet(workbook.addWorksheet("Metric Definitions"), report);

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer);
  return {
    blob: new Blob([bytes], {type: EXCEL_MIME_TYPE}),
    fileName: excelFileName(report),
  };
}

function buildSummarySheet(sheet: Worksheet, report: AdminReportResult): void {
  configureSheet(sheet, [30, 24, 24, 18]);
  title(sheet, "FEASTA ADMINISTRATIVE REPORT", 4);
  subtitle(sheet, `Reports and Insights · ${report.filters.period.label}`, 4);
  sheet.addRow([]);
  section(sheet, "Report metadata", 4);
  keyValue(sheet, "Generated at", new Date(report.generatedAt), "mmm d, yyyy h:mm AM/PM");
  keyValue(sheet, "Reporting period", report.filters.period.label);
  keyValue(sheet, "Comparison period", report.filters.comparisonPeriod?.label ?? "None");
  keyValue(sheet, "Grouping", titleCase(report.filters.grouping));
  keyValue(sheet, "Time zone", report.timeZone);
  keyValue(sheet, "Currency", report.currency);
  keyValue(sheet, "Data source", "Authorized server-generated bounded operational data");
  sheet.addRow([]);
  section(sheet, "Applied filters", 4);
  for (const [label, value] of [
    ["Date preset", report.filters.datePreset],
    ["Provider service type", report.filters.providerServiceType],
    ["Provider request type", report.filters.providerRequestType],
    ["Event type", report.filters.eventType],
    ["City", report.filters.city],
    ["Booking status", report.filters.bookingStatus],
    ["Payment status", report.filters.paymentStatus],
  ]) keyValue(sheet, label, titleCase(value));
  sheet.addRow([]);
  section(sheet, "Executive overview", 4);
  tableHeader(sheet, ["Metric", "Current", "Previous", "Change"]);
  metricRow(sheet, "Total bookings", report.executive.totalBookings);
  metricRow(sheet, "Confirmed bookings", report.executive.confirmedBookings);
  metricRow(sheet, "Completed events", report.executive.completedEvents);
  rateRow(sheet, "Cancellation rate", report.executive.cancellationRate);
  metricRow(sheet, "Active customers", report.executive.activeCustomers);
  metricRow(sheet, "Active providers", report.executive.activeProviders);
  moneyRow(sheet, "Confirmed payment volume", report.executive.confirmedPaymentVolume);
  moneyRow(sheet, "Average paid payment", report.executive.averagePaidPayment);
  sheet.addRow([]);
  section(sheet, "Financial interpretation", 4);
  keyValue(sheet, "Provider-associated volume", report.payments.providerAssociatedVolume.valueInCentavos / 100, currencyFormat());
  keyValue(sheet, "FEASTA platform revenue", "Not configured");
  keyValue(sheet, "Explanation", report.payments.platformRevenue.explanation);
  finishSheet(sheet);
}

function buildBookingSheet(sheet: Worksheet, report: AdminReportResult): void {
  configureSheet(sheet, [22, 15, 15, 15, 15, 15]);
  title(sheet, "BOOKING PERFORMANCE", 6);
  subtitle(sheet, report.filters.period.label, 6);
  sheet.addRow([]);
  section(sheet, "Booking status distribution", 6);
  tableHeader(sheet, ["Status", "Count", "Share"]);
  for (const point of report.bookings.statusDistribution) {
    const row = sheet.addRow([titleCase(point.status), point.count, point.percentage / 100]);
    row.getCell(3).numFmt = "0.0%";
  }
  sheet.addRow([]);
  section(sheet, "Booking activity by period", 6);
  const headerRow = tableHeader(sheet, ["Period", "Created", "Confirmed", "Completed", "Cancelled", "Expired"]);
  for (const point of report.bookings.trend) {
    sheet.addRow([point.label, point.created, point.confirmed, point.completed, point.cancelled, point.expired]);
  }
  addFilter(sheet, headerRow, 6);
  sheet.addRow([]);
  section(sheet, "Provider request outcomes", 6);
  tableHeader(sheet, ["Status", "Count", "Share"]);
  for (const point of report.bookings.providerRequests.byStatus) {
    const row = sheet.addRow([titleCase(point.status), point.count, point.percentage / 100]);
    row.getCell(3).numFmt = "0.0%";
  }
  sheet.addRow([]);
  keyValue(sheet, "Acceptance rate", report.bookings.providerRequests.acceptanceRate.value / 100, "0.0%");
  keyValue(sheet, "Rejection rate", report.bookings.providerRequests.rejectionRate.value / 100, "0.0%");
  keyValue(sheet, "Average response time (minutes)", report.bookings.providerRequests.averageResponseTimeInMinutes ?? "Not available");
  keyValue(sheet, "Average booking lead time (days)", report.bookings.averageLeadTimeInDays ?? "Not available");
  finishSheet(sheet);
}

function buildPaymentSheet(sheet: Worksheet, report: AdminReportResult): void {
  configureSheet(sheet, [
    34, // Summary labels and period
    18,
    16,
    20,
    16,
    22,
    22,
    24,
    26,
    ]);
  title(sheet, "PAYMENT PERFORMANCE", 9);
  subtitle(sheet, "Provider-associated payment activity · Not FEASTA-owned revenue", 9);
  sheet.addRow([]);
  section(sheet, "Payment summary", 9);
  for (const [label, value, format] of [
    ["Created payments", report.payments.createdPayments.value, undefined],
    ["Successful payment attempts", report.payments.successfulPaymentAttempts.value, undefined],
    ["Currently paid payments", report.payments.currentlyPaidPayments.value, undefined],
    ["Gross collected volume", report.payments.grossCollectedVolume.valueInCentavos / 100, currencyFormat()],
    ["Confirmed payment volume", report.payments.confirmedPaymentVolume.valueInCentavos / 100, currencyFormat()],
    ["Provider-associated volume", report.payments.providerAssociatedVolume.valueInCentavos / 100, currencyFormat()],
    ["Refunded amount", report.payments.refundedAmount.valueInCentavos / 100, currencyFormat()],
    ["Payment success rate", report.payments.paymentSuccessRate.value / 100, "0.0%"],
    ["Refund rate", report.payments.refundRate.value / 100, "0.0%"],
    ["FEASTA platform revenue", "Not configured", undefined],
  ] as const) keyValue(sheet, label, value, format);
  sheet.addRow([]);
  section(sheet, "Payment activity by period", 9);
  const headerRow = tableHeader(sheet, [
    "Period", "Created", "Successful", "Failed / expired", "Refunded",
    "Gross collected", "Currently paid", "Refunded amount", "Provider-associated",
  ]);
  for (const point of report.payments.trend) {
    const row = sheet.addRow([
      point.label,
      point.createdPayments,
      point.successfulPayments,
      point.failedOrExpiredPayments,
      point.refundedPayments,
      point.collectedVolumeInCentavos / 100,
      point.currentlyPaidVolumeInCentavos / 100,
      point.refundedAmountInCentavos / 100,
      point.netProviderAssociatedVolumeInCentavos / 100,
    ]);
    for (let column = 6; column <= 9; column += 1) row.getCell(column).numFmt = currencyFormat();
  }
  addFilter(sheet, headerRow, 9);
  sheet.addRow([]);
  section(sheet, "Payments by status", 9);
  tableHeader(sheet, ["Status", "Count", "Amount"]);
  for (const point of report.payments.byStatus) {
    const row = sheet.addRow([titleCase(point.status), point.count, point.amountInCentavos / 100]);
    row.getCell(3).numFmt = currencyFormat();
  }
  sheet.addRow([]);
  section(sheet, "Payments by type", 9);
  tableHeader(sheet, ["Payment type", "Count", "Amount"]);
  for (const point of report.payments.byType) {
    const row = sheet.addRow([titleCase(point.paymentType), point.count, point.amountInCentavos / 100]);
    row.getCell(3).numFmt = currencyFormat();
  }
  finishSheet(sheet);
}

function buildProviderSheet(sheet: Worksheet, report: AdminReportResult): void {
  configureSheet(sheet, [24, 28, 20, 24, 12, 12, 12, 14, 14, 14, 18, 16, 18, 16, 14, 16, 18]);
  title(sheet, "PROVIDER PERFORMANCE", 17);
  subtitle(sheet, report.filters.period.label, 17);
  sheet.addRow([]);
  const headerRow = tableHeader(sheet, [
    "Provider ID", "Provider", "Service type", "Category", "Requests",
    "Accepted", "Rejected", "Confirmed", "Completed", "Cancelled",
    "Acceptance rate", "Rejection rate", "Cancellation rate", "Avg response (min)",
    "Avg rating", "Published reviews", "Confirmed payment volume",
  ]);
  for (const provider of report.providers.providers) {
    const row = sheet.addRow([
      safeText(provider.providerId),
      safeText(provider.providerName),
      titleCase(provider.serviceType),
      provider.providerCategory ? titleCase(provider.providerCategory) : "Not specified",
      provider.requestsReceived,
      provider.acceptedRequests,
      provider.rejectedRequests,
      provider.confirmedBookings,
      provider.completedEvents,
      provider.cancelledRequests,
      provider.acceptanceRate / 100,
      provider.rejectionRate / 100,
      provider.cancellationRate / 100,
      provider.averageResponseTimeInMinutes ?? "Not available",
      provider.averageRating,
      provider.publishedReviewCount,
      provider.confirmedPaymentVolumeInCentavos / 100,
    ]);
    for (const column of [11, 12, 13]) row.getCell(column).numFmt = "0.0%";
    row.getCell(15).numFmt = "0.0";
    row.getCell(17).numFmt = currencyFormat();
  }
  addFilter(sheet, headerRow, 17);
  finishSheet(sheet);
}

function buildDefinitionsSheet(sheet: Worksheet, report: AdminReportResult): void {
  configureSheet(sheet, [34, 95]);
  title(sheet, "METRIC DEFINITIONS", 2);
  subtitle(sheet, "Definitions used throughout FEASTA administrative reporting", 2);
  sheet.addRow([]);
  const headerRow = tableHeader(sheet, ["Metric", "Definition"]);
  for (const definition of report.definitions) {
    const row = sheet.addRow([definition.label, definition.description]);
    row.alignment = {vertical: "top", wrapText: true};
  }
  addFilter(sheet, headerRow, 2);
  finishSheet(sheet);
}

function configureSheet(sheet: Worksheet, widths: number[]): void {
  sheet.views = [{state: "frozen", ySplit: 3, showGridLines: false}];
  sheet.properties.defaultRowHeight = 20;
  sheet.pageSetup = {orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0};
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function title(sheet: Worksheet, value: string, columns: number): void {
  const row = sheet.addRow([value]);
  sheet.mergeCells(row.number, 1, row.number, columns);
  row.height = 30;
  row.getCell(1).font = {bold: true, color: {argb: "FFFFFFFF"}, size: 16};
  row.getCell(1).fill = {type: "pattern", pattern: "solid", fgColor: {argb: DARK}};
  row.getCell(1).alignment = {vertical: "middle"};
}

function subtitle(sheet: Worksheet, value: string, columns: number): void {
  const row = sheet.addRow([value]);
  sheet.mergeCells(row.number, 1, row.number, columns);
  row.getCell(1).font = {italic: true, color: {argb: MUTED}};
}

function section(sheet: Worksheet, value: string, columns: number): void {
  const row = sheet.addRow([value]);
  sheet.mergeCells(row.number, 1, row.number, columns);
  row.getCell(1).font = {bold: true, color: {argb: DARK}, size: 12};
  row.getCell(1).fill = {type: "pattern", pattern: "solid", fgColor: {argb: LIGHT}};
}

function tableHeader(sheet: Worksheet, values: string[]): Row {
  const row = sheet.addRow(values);
  row.height = 28;
  row.eachCell((cell) => styleHeaderCell(cell));
  return row;
}

function styleHeaderCell(cell: Cell): void {
  cell.font = {bold: true, color: {argb: "FFFFFFFF"}};
  cell.fill = {type: "pattern", pattern: "solid", fgColor: {argb: ORANGE}};
  cell.alignment = {vertical: "middle", wrapText: true};
  cell.border = {bottom: {style: "thin", color: {argb: BORDER}}};
}

function keyValue(sheet: Worksheet, label: string, value: string | number | Date, format?: string): void {
  const row = sheet.addRow([label, value]);
  row.getCell(1).font = {bold: true, color: {argb: DARK}};
  row.getCell(2).alignment = {wrapText: true};
  if (format) row.getCell(2).numFmt = format;
}

function metricRow(sheet: Worksheet, label: string, metric: AdminReportResult["executive"]["totalBookings"]): void {
  sheet.addRow([label, metric.value, metric.previousValue ?? "Not comparable", metric.percentageChange === null ? "Not comparable" : metric.percentageChange / 100]);
  if (metric.percentageChange !== null) sheet.lastRow!.getCell(4).numFmt = "0.0%";
}

function rateRow(sheet: Worksheet, label: string, metric: AdminReportResult["executive"]["cancellationRate"]): void {
  const row = sheet.addRow([label, metric.value / 100, metric.previousValue === null ? "Not comparable" : metric.previousValue / 100, metric.percentageChange === null ? "Not comparable" : metric.percentageChange / 100]);
  row.getCell(2).numFmt = "0.0%";
  if (typeof row.getCell(3).value === "number") row.getCell(3).numFmt = "0.0%";
  if (typeof row.getCell(4).value === "number") row.getCell(4).numFmt = "0.0%";
}

function moneyRow(sheet: Worksheet, label: string, metric: AdminReportResult["executive"]["confirmedPaymentVolume"]): void {
  const row = sheet.addRow([label, metric.valueInCentavos / 100, metric.previousValueInCentavos === null ? "Not comparable" : metric.previousValueInCentavos / 100, metric.percentageChange === null ? "Not comparable" : metric.percentageChange / 100]);
  row.getCell(2).numFmt = currencyFormat();
  if (typeof row.getCell(3).value === "number") row.getCell(3).numFmt = currencyFormat();
  if (typeof row.getCell(4).value === "number") row.getCell(4).numFmt = "0.0%";
}

function addFilter(sheet: Worksheet, headerRow: Row, columns: number): void {
  sheet.autoFilter = {from: {row: headerRow.number, column: 1}, to: {row: headerRow.number, column: columns}};
}

function finishSheet(sheet: Worksheet): void {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    row.eachCell((cell) => {
      cell.alignment = {...cell.alignment, vertical: "top"};
      cell.border = {...cell.border, bottom: {style: "hair", color: {argb: BORDER}}};
    });
  });
}

function currencyFormat(): string {
  return '"₱"#,##0.00';
}

function titleCase(value: string): string {
  if (value.toLowerCase() === "all") return "All";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeText(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

function excelFileName(report: AdminReportResult): string {
  const generated = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(report.generatedAt));
  return `feasta-admin-report-${generated}.xlsx`;
}