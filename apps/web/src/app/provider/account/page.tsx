import {AccountManagementPanel} from "@/components/account/account-management-panel";
import {PageHeading} from "@/components/layout/page-heading";
import {loadAccountManagementProfile} from "@/lib/auth/account-management";
import {
  requireProvider,
  requireVerifiedEmail,
} from "@/lib/auth/session";

export default async function ProviderAccountPage() {
  const account = requireVerifiedEmail(
    await requireProvider(),
    "/provider-verify-email",
  );
  const profile = await loadAccountManagementProfile(account);
  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Provider account"
        title="Owner and business account"
        description="Manage safe owner and business details without changing approval-controlled fields."
      />
      <AccountManagementPanel profile={profile} />
    </div>
  );
}
