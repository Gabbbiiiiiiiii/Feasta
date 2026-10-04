import {AdminCancellationRolloutClient} from "@/components/admin/settings/admin-cancellation-rollout-client";
import {getAdminCancellationRollout} from "@/lib/admin/settings/admin-cancellation-rollout-service";
import {
  AdminFinancialPolicyClient,
} from "@/components/admin/settings/admin-financial-policy-client";
import {
  AdminSettingsClient,
} from "@/components/admin/settings/admin-settings-client";
import {
  getAdminPlatformSettings,
} from "@/lib/admin/settings/admin-settings-service";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminSettingsPage() {
  await requireAdmin();

  const [settings, cancellationRollout] = await Promise.all([
    getAdminPlatformSettings(),
    getAdminCancellationRollout(),
  ]);

  return (
    <div className="grid gap-6">
      <AdminSettingsClient
        initialSettings={settings}
      />

      <AdminFinancialPolicyClient
        initialSettings={settings}
      />
      <AdminCancellationRolloutClient initialSettings={cancellationRollout} />
    </div>
  );
}
