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
        description="Manage safe personal fields, privacy choices, sign-in security, and account lifecycle."
      />
      <AccountManagementPanel profile={profile} />
    </div>
  );
}
