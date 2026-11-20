import {
  AdminReportsExecutiveClient,
} from "@/components/admin/reports/admin-reports-executive-client";
import {
  getAdminReport,
} from "@/lib/admin/reports/admin-report-service";
import {
  DEFAULT_ADMIN_REPORT_FILTERS,
} from "@/lib/admin/reports/admin-report-types";
import {
  getServiceCategoryOptions,
} from "@/lib/service-categories/service-category-service";

export default async function AdminReportsPage() {
  const [
    initialReport,
    serviceCategoryOptions,
  ] = await Promise.all([
    getAdminReport(
      DEFAULT_ADMIN_REPORT_FILTERS,
    ),
    getServiceCategoryOptions(),
  ]);

  return (
    <AdminReportsExecutiveClient
      initialReport={initialReport}
      serviceCategoryOptions={serviceCategoryOptions}
    />
  );
}