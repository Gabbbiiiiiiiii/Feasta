import { requireAdmin } from "@/lib/auth/session";
import { getAdminUserPage } from "@/lib/admin/users/admin-user-service";
import { UserManagementClient } from "@/components/admin/users/user-management-client";

export default async function AdminUsersPage() {
  await requireAdmin();

  const initialPage = await getAdminUserPage({
    search: "",
    role: "all",
    accountStatus: "all",
    verificationStatus: "all",
    pageSize: 10,
    cursor: null,
  });

  return (
    <UserManagementClient
      initialPage={initialPage}
    />
  );
}