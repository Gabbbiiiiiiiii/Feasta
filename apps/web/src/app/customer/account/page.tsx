import {AccountManagementPanel} from "@/components/account/account-management-panel";
import {PageHeading} from "@/components/layout/page-heading";
import {loadAccountManagementProfile} from "@/lib/auth/account-management";
import {requireCustomer, requireVerifiedEmail} from "@/lib/auth/session";

export default async function CustomerAccountPage() {
  const account = requireVerifiedEmail(await requireCustomer());
  const profile = await loadAccountManagementProfile(account);
  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Customer account"
        title="Profile and account"
        description="Manage your profile, notification preferences, and sign-in security."
      />
      <AccountManagementPanel profile={profile} />
    </div>
  );
}
