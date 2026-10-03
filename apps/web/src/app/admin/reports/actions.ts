"use server";

import {
  getAdminReport,
} from "@/lib/admin/reports/admin-report-service";
import type {
  AdminReportFilters,
  AdminReportResult,
} from "@/lib/admin/reports/admin-report-types";

export async function loadAdminReportAction(
  filters: AdminReportFilters,
): Promise<AdminReportResult> {
  return getAdminReport(filters);
}