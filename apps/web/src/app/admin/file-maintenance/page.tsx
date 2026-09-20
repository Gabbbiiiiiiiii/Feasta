import {
  ServiceCategoryManagementClient,
} from "@/components/admin/file-maintenance/service-category-management-client";
import {
  getAdminServiceCategories,
} from "@/lib/admin/file-maintenance/admin-service-category-service";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminFileMaintenancePage() {
  await requireAdmin();

  const categories =
    await getAdminServiceCategories();

  return (
    <ServiceCategoryManagementClient
      initialCategories={categories}
    />
  );
}
