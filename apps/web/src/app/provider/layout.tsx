import {
  ApplicationShell,
} from "@/components/layout/application-shell";
import {
  requireProvider,
  requireVerifiedProviderIdentity,
} from "@/lib/auth/session";

export default async function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user =
    requireVerifiedProviderIdentity(
      await requireProvider(),
    );

  return (
    <ApplicationShell
      role="provider"
      accountLabel={
        user.email ??
        user.uid
      }
      providerServiceType={
        user.provider
          ?.providerServiceType
      }
    >
      {children}
    </ApplicationShell>
  );
}