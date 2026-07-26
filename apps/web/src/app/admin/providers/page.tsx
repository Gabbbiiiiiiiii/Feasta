import { ProviderVerificationClient } from "@/components/admin/provider-verification/provider-verification-client";
import { getProviderVerificationApplications } from "@/lib/admin/provider-verification/provider-verification-service";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminProvidersPage() {
  await requireAdmin();

  const applications =
    await getProviderVerificationApplications();

  return (
    <ProviderVerificationClient
      initialApplications={applications}
    />
  );
}