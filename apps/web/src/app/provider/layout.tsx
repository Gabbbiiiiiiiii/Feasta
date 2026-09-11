import {
  ApplicationShell,
} from "@/components/layout/application-shell";
import {
  requireProvider,
  requireProviderIdentityAccess,
} from "@/lib/auth/session";

export default async function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = requireProviderIdentityAccess(
    await requireProvider(),
  );

  const providerContext = !user.emailVerified
    ? {kind: "identity-limited" as const}
    : user.provider
      ? {
          kind: "profile" as const,
          providerServiceType:
            user.provider.providerServiceType,
          verificationStatus:
            user.provider.verificationStatus,
          isActive:
            user.provider.isActive,
          isSuspended:
            user.provider.isSuspended,
          isDeleted:
            user.provider.isDeleted,
        }
      : {kind: "no-profile" as const};

  return (
    <ApplicationShell
      role="provider"
      accountLabel={
        user.email ??
        user.uid
      }
      providerContext={providerContext}
    >
      {children}
    </ApplicationShell>
  );
}
