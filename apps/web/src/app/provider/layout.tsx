import {ApplicationShell} from "@/components/layout/application-shell";
import {requireProvider, requireVerifiedEmail} from "@/lib/auth/session";

export default async function ProviderLayout({children}: {children: React.ReactNode}) {
  const user = requireVerifiedEmail(
    await requireProvider(),
    "/provider-verify-email",
  );
  return (
    <ApplicationShell role="provider" accountLabel={user.email ?? user.uid}>
      {children}
    </ApplicationShell>
  );
}
