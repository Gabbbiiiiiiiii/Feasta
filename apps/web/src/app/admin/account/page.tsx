import {AccountManagementPanel} from "@/components/account/account-management-panel";
import {PageHeading} from "@/components/layout/page-heading";
import {loadAccountManagementProfile} from "@/lib/auth/account-management";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminAccountPage() {
  const account = await requireAdmin();
  const profile = await loadAccountManagementProfile(account);
  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Admin account"
        title="Administrative profile"
        description="Manage limited personal fields, preferences, credentials, and trusted sessions."
      />
      <AccountManagementPanel profile={profile} />
    </div>
  );
}
