import {
  AdminReportsExecutiveClient,
} from "@/components/admin/reports/admin-reports-executive-client";
import {
  getAdminReport,
} from "@/lib/admin/reports/admin-report-service";
import {
  DEFAULT_ADMIN_REPORT_FILTERS,
} from "@/lib/admin/reports/admin-report-types";

export default async function AdminReportsPage() {
  const initialReport = await getAdminReport(
    DEFAULT_ADMIN_REPORT_FILTERS,
  );

  return (
    <AdminReportsExecutiveClient
      initialReport={initialReport}
    />
  );
}