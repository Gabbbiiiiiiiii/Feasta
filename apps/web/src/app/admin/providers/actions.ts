"use server";

import {requireAdmin} from "@/lib/auth/session";
import {getProviderVerificationQueue, getProviderVerificationQueueSummary, getProviderVerificationReview} from "@/lib/admin/provider-verification/provider-verification-service";
import type {ProviderVerificationQueueFilters} from "@/lib/admin/provider-verification/provider-verification-types";

export async function loadProviderVerificationQueueAction(filters: ProviderVerificationQueueFilters, selectedId: string | null) {
  await requireAdmin();
  const [page, summary, selected] = await Promise.all([
    getProviderVerificationQueue(filters),
    getProviderVerificationQueueSummary(),
    selectedId ? getProviderVerificationReview(selectedId) : Promise.resolve(null),
  ]);
  return {page, summary, selected};
}
