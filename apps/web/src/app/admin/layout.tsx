import {ApplicationShell} from "@/components/layout/application-shell";
import {requireRole} from "@/lib/auth/session";

export default async function AdminLayout({children}: {children: React.ReactNode}) {
  const user = await requireRole(["admin"]);
  return (
    <ApplicationShell role="admin" accountLabel={user.email ?? user.uid}>
      {children}
    </ApplicationShell>
  );
}
