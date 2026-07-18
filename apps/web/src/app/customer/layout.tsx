import {ApplicationShell} from "@/components/layout/application-shell";
import {requireRole} from "@/lib/auth/session";

export default async function CustomerLayout({children}: {children: React.ReactNode}) {
  const user = await requireRole(["customer"]);
  return (
    <ApplicationShell role="customer" accountLabel={user.email ?? user.uid}>
      {children}
    </ApplicationShell>
  );
}
