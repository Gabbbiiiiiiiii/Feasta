/**
 * Counts genuine unanswered provider requests.
 *
 * A booking needing provider replacement is not automatically
 * pending. It is pending only while another provider request
 * remains unanswered.
 *
 * This function never changes booking or payment data.
 */
export function countPendingProviderResponses(
  booking: {
    status?: unknown;
    pendingProviderRequestCount?: unknown;
  },
): number {
  if (
    booking.status !== "pending_provider_approval" &&
    booking.status !== "needs_provider_replacement"
  ) {
    return 0;
  }

  const count = booking.pendingProviderRequestCount;

  if (
    typeof count !== "number" ||
    !Number.isSafeInteger(count) ||
    count <= 0
  ) {
    return 0;
  }

  return count;
}
