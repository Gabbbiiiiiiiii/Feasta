import {ApplicationShell} from "@/components/layout/application-shell";
import {requireRole} from "@/lib/auth/session";

export default async function ProviderLayout({children}: {children: React.ReactNode}) {
  const user = await requireRole(["provider"]);
  return (
    <ApplicationShell role="provider" accountLabel={user.email ?? user.uid}>
      {children}
    </ApplicationShell>
  );
}
