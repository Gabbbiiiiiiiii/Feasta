"use server";

import {getAdminAuditLogPage} from "@/lib/admin/audit-logs/admin-audit-log-service";
import type {
  AdminAuditLogFilters,
  AdminAuditLogPage,
} from "@/lib/admin/audit-logs/admin-audit-log-types";
import {requireAdmin} from "@/lib/auth/session";

export async function loadAdminAuditLogsAction(
  filters: AdminAuditLogFilters,
): Promise<AdminAuditLogPage> {
  await requireAdmin();
  return getAdminAuditLogPage(filters);
}
