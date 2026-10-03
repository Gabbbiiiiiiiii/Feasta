import { requireAdmin } from "@/lib/auth/session";
import { getServiceCategoryOptions } from "@/lib/service-categories/service-category-service";
import { getAdminUserPage } from "@/lib/admin/users/admin-user-service";
import { UserManagementClient } from "@/components/admin/users/user-management-client";

export default async function AdminUsersPage() {
  await requireAdmin();

  const [initialPage, serviceCategoryOptions] = await Promise.all([
    getAdminUserPage({
      search: "",
      role: "all",
      accountStatus: "all",
      verificationStatus: "all",
      pageSize: 10,
      cursor: null,
    }),
    getServiceCategoryOptions(),
  ]);

  return (
    <UserManagementClient
      initialPage={initialPage}
      serviceCategoryOptions={serviceCategoryOptions}
    />
  );
}