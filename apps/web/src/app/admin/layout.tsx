import {ApplicationShell} from "@/components/layout/application-shell";
import {requireAdmin} from "@/lib/auth/session";

export default async function AdminLayout({children}: {children: React.ReactNode}) {
  const user = await requireAdmin();
  return (
    <ApplicationShell role="admin" accountLabel={user.email ?? user.uid}>
      {children}
    </ApplicationShell>
  );
}
