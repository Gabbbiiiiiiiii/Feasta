/// Presentation-only booking tab filtering.
///
/// Does not authorize booking actions or change Firestore statuses.
bool customerBookingStatusMatchesFilter(String status, String filter) {
  const terminalStatuses = {
    'completed',
    'cancelled',
    'expired',
    'rejected',
  };

  const pendingStatuses = {
    'pending',
    'pending_provider_approval',
    'accepted',
    'waiting_payment',
    'waiting_for_down_payment',
    'payment_processing',
  };

  final terminal = terminalStatuses.contains(status);
  final pending = pendingStatuses.contains(status);

  return filter == 'All' ||
      (filter == 'Past' && terminal) ||
      (filter == 'Pending' && pending) ||
      (filter == 'Upcoming' &&
          !terminal &&
          !pending &&
          status != 'needs_provider_replacement');
}
/// Match Web booking ordering: createdAt DESC, then document ID DESC.
/// Missing creation timestamps sort last. Presentation only.
int compareCustomerBookingCreatedNewest(
  DateTime? leftCreatedAt,
  String leftId,
  DateTime? rightCreatedAt,
  String rightId,
) {
  if (leftCreatedAt == null && rightCreatedAt != null) return 1;
  if (leftCreatedAt != null && rightCreatedAt == null) return -1;

  if (leftCreatedAt != null && rightCreatedAt != null) {
    final byCreatedAt = rightCreatedAt.compareTo(leftCreatedAt);
    if (byCreatedAt != 0) return byCreatedAt;
  }

  return rightId.compareTo(leftId);
}
