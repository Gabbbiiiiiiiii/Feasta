import {
  type MainEventStatus,
  type ProviderRequestStatus,
} from "@feasta/shared-types";

const CHAT_ELIGIBLE_PROVIDER_REQUEST_STATUSES = new Set<ProviderRequestStatus>([
  "pending",
  "accepted",
  "waiting_for_down_payment",
  "payment_processing",
  "confirmed",
  "in_progress",
]);

const CHAT_ELIGIBLE_MAIN_EVENT_STATUSES = new Set<MainEventStatus>([
  "pending_provider_approval",
  "needs_provider_replacement",
  "waiting_for_down_payment",
  "confirmed",
  "in_progress",
]);

export function isChatLifecycleEligible(
  providerRequestStatus: ProviderRequestStatus | null,
  mainEventStatus: MainEventStatus | null,
): boolean {
  return providerRequestStatus !== null &&
    mainEventStatus !== null &&
    CHAT_ELIGIBLE_PROVIDER_REQUEST_STATUSES.has(providerRequestStatus) &&
    CHAT_ELIGIBLE_MAIN_EVENT_STATUSES.has(mainEventStatus);
}
