import {AccountManagementPanel} from "@/components/account/account-management-panel";
import {PageHeading} from "@/components/layout/page-heading";
import {loadAccountManagementProfile} from "@/lib/auth/account-management";
import {
  requireProvider,
  requireProviderIdentityAccess,
} from "@/lib/auth/session";

export default async function ProviderAccountPage() {
  const account = requireProviderIdentityAccess(
    await requireProvider(),
  );
  const profile = await loadAccountManagementProfile(account);
  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Provider account"
        title="Owner Account & Settings"
        description="Manage owner identity, sign-in security, sessions, and account preferences."
      />
      <AccountManagementPanel profile={profile} />
    </div>
  );
}
