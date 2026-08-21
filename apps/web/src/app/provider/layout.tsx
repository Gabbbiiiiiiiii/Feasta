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
      providerContext={
        user.provider
          ? {
              kind: "profile",
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
          : {
              kind: "no-profile",
            }
      }
    >
      {children}
    </ApplicationShell>
  );
}
