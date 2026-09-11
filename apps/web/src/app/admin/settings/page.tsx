import {
  AdminSettingsClient,
} from "@/components/admin/settings/admin-settings-client";
import {
  getAdminPlatformSettings,
} from "@/lib/admin/settings/admin-settings-service";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminSettingsPage() {
  await requireAdmin();

  const settings =
    await getAdminPlatformSettings();

  return (
    <AdminSettingsClient
      initialSettings={settings}
    />
  );
}