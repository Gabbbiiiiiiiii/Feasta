import {ProviderVerificationQueue} from "@/components/admin/provider-verification/provider-verification-queue";
import {
  parseProviderVerificationQueueFilters,
  selectedVerificationId,
} from "@/lib/admin/provider-verification/provider-verification-query";
import {
  getProviderVerificationQueue,
  getProviderVerificationQueueSummary,
  getProviderVerificationReview,
} from "@/lib/admin/provider-verification/provider-verification-service";
import {requireAdmin} from "@/lib/auth/session";

type AdminProvidersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProvidersPage({
  searchParams,
}: AdminProvidersPageProps) {
  await requireAdmin();
  const values = await searchParams;
  const filters = parseProviderVerificationQueueFilters(values);
  const selectedId = selectedVerificationId(values);
  const [page, summary, selected] = await Promise.all([
    getProviderVerificationQueue(filters),
    getProviderVerificationQueueSummary(),
    selectedId
      ? getProviderVerificationReview(selectedId)
      : Promise.resolve(null),
  ]);

  return (
    <ProviderVerificationQueue
      page={page}
      summary={summary}
      filters={filters}
      selected={selected}
    />
  );
}
