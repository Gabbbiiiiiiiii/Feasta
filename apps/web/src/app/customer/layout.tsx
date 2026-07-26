import {ApplicationShell} from "@/components/layout/application-shell";
import {requireCustomer, requireVerifiedEmail} from "@/lib/auth/session";

export default async function CustomerLayout({children}: {children: React.ReactNode}) {
  const user = requireVerifiedEmail(await requireCustomer());
  return (
    <ApplicationShell role="customer" accountLabel={user.email ?? user.uid}>
      {children}
    </ApplicationShell>
  );
}
