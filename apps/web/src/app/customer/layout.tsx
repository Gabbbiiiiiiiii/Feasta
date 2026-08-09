import {CustomerMarketplaceShell} from "@/components/customer/layout/customer-marketplace-shell";
import {requireCustomer, requireVerifiedEmail} from "@/lib/auth/session";

export default async function CustomerLayout({children}: {children: React.ReactNode}) {
  const user = requireVerifiedEmail(await requireCustomer());

  return (
    <CustomerMarketplaceShell accountLabel={user.email ?? user.uid}>
      {children}
    </CustomerMarketplaceShell>
  );
}