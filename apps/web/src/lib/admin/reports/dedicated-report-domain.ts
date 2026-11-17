import {COMPLAINT_STATUSES} from "@feasta/shared-types";
import {REPORT_TITLES, type ReportFilters} from "./dedicated-report-types";
import type {AdminFinancialLedgerRow} from "./admin-financial-report-types";

export type ReportRecord = {id: string; data: Record<string, unknown>};
export const text = (value: unknown, fallback = "Unavailable") => typeof value === "string" && value.trim() ? value.trim() : fallback;
export function person(data: Record<string, unknown>) {
  return [text(data.firstName, ""), text(data.lastName, "")].filter(Boolean).join(" ") || text(data.displayName, "Unnamed account");
}
export function iso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return iso(value.toDate());
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : "";
}
export function accountState(user: Record<string, unknown>, provider?: Record<string, unknown>): string {
  if (user.accountStatus === "pending_deletion") return "Pending Deletion";
  if (provider?.isSuspended === true) return "Suspended";
  if (user.isBlocked === true || user.accountStatus === "blocked") return "Blocked";
  if (provider?.isDeleted === true) return "Deleted";
  if (user.isActive === false || provider?.isActive === false || ["disabled", "deactivated"].includes(text(user.accountStatus, ""))) return "Inactive";
  if (provider && provider.verificationStatus !== "approved") {
    const states: Record<string, string> = {draft: "Draft", submitted: "Submitted", under_review: "Under Review", rejected: "Rejected", resubmission_required: "Resubmission Required", suspended: "Suspended"};
    return states[text(provider.verificationStatus, "")] || "Unknown";
  }
  return user.isActive === true || user.accountStatus === "active" ? "Active" : "Unknown";
}
export function validateReportFilters(filters: ReportFilters) {
  if (!filters || !Object.hasOwn(REPORT_TITLES, filters.type) ||
    !["all", "below_3"].includes(filters.rating) || !["providers", "customers"].includes(filters.directory) ||
    !["all", ...COMPLAINT_STATUSES].includes(filters.complaintStatus) ||
    !["all", "Active", "Inactive", "Blocked", "Suspended", "Under Review", "Draft", "Submitted", "Rejected", "Resubmission Required", "Deleted", "Pending Deletion", "Unknown"].includes(filters.status) ||
    typeof filters.category !== "string" || filters.category.length > 150 ||
    !["all", "Ormoc City"].includes(filters.municipality)) throw new Error("Invalid report filters.");
  for (const value of [filters.startDate, filters.endDate]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || iso(value).slice(0, 10) !== value) throw new Error("Choose valid report dates.");
  }
  if (filters.startDate > filters.endDate) throw new Error("The end date must be on or after the start date.");
  if (Date.parse(filters.endDate) - Date.parse(filters.startDate) > 366 * 86400000) throw new Error("Choose a date range of up to one year.");
}
export function inPeriod(value: unknown, filters: ReportFilters) {
  const date = iso(value);
  if (!date) return false;
  const localDate = new Date(Date.parse(date) + 8 * 3600000).toISOString().slice(0, 10);
  return localDate >= filters.startDate && localDate <= filters.endDate;
}
export function sumLedger(rows: readonly AdminFinancialLedgerRow[]) {
  return rows.reduce((sum, row) => ({
    gross: sum.gross + row.grossAmountInCentavos,
    commission: sum.commission + row.commissionAccruedInCentavos - row.commissionReversedInCentavos,
    net: sum.net + row.grossAmountInCentavos - row.refundAmountInCentavos,
  }), {gross: 0, commission: 0, net: 0});
}
export const money = (centavos: number) => (centavos / 100).toLocaleString("en-PH", {minimumFractionDigits: 2, maximumFractionDigits: 2});
