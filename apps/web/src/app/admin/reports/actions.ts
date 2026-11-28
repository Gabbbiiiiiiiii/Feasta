"use server";

import {
  getAdminReportModule,
} from "@/lib/admin/reports/admin-report-modules-service";
import type {
  AdminReportModulePayload,
  AdminReportModuleRequest,
} from "@/lib/admin/reports/admin-report-modules-types";
import {
  getAdminReport,
} from "@/lib/admin/reports/admin-report-service";
import type {
  AdminReportFilters,
  AdminReportResult,
} from "@/lib/admin/reports/admin-report-types";

export async function loadAdminReportModuleAction(
  request: AdminReportModuleRequest,
): Promise<AdminReportModulePayload> {
  return getAdminReportModule(request);
}

export async function loadAdminReportAction(
  filters: AdminReportFilters,
): Promise<AdminReportResult> {
  return getAdminReport(filters);
}
