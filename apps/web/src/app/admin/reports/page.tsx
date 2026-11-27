import {
  AdminReportsWorkspaceClient,
} from "@/components/admin/reports/admin-reports-workspace-client";
import {
  getInitialAdminReportsModule,
} from "@/lib/admin/reports/admin-report-modules-service";

export default async function AdminReportsPage() {
  const initialServiceFees = await getInitialAdminReportsModule();

  return (
    <AdminReportsWorkspaceClient
      initialServiceFees={initialServiceFees}
    />
  );
}
