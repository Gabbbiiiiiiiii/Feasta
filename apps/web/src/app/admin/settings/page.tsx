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

      <details className="rounded-card border border-border bg-card p-5">
        <summary className="cursor-pointer font-bold">Additional settings</summary>
        <p className="mt-2 text-sm text-muted-foreground">Manage fee policies and cancellation availability.</p>
        <div className="mt-4 grid gap-6">
          <AdminFinancialPolicyClient initialSettings={settings} />
          <AdminCancellationRolloutClient initialSettings={cancellationRollout} />
        </div>
      </details>
    </div>
  );
}
