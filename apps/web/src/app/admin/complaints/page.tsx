import {
  ComplaintManagementClient,
} from "@/components/admin/complaints/complaint-management-client";
import {
  getAdminComplaintPage,
} from "@/lib/admin/complaints/admin-complaint-service";
import {
  requireAdmin,
} from "@/lib/auth/session";

export default async function AdminComplaintsPage() {
  await requireAdmin();

  const initialPage =
    await getAdminComplaintPage({
      search: "",
      status: "all",
      priority: "all",
      pageSize: 10,
      cursor: null,
    });

  return (
    <ComplaintManagementClient
      initialPage={initialPage}
    />
  );
}