import 'package:cloud_firestore/cloud_firestore.dart';

/// Read-only projection. Only the server can calculate or authorize this window.
class InitialPaymentDeadline {
  const InitialPaymentDeadline._(this.at, this.hasValidEvidence);

  final DateTime? at;
  final bool hasValidEvidence;

  factory InitialPaymentDeadline.fromRecord(Map<String, dynamic> data) {
    DateTime? timestamp(String key) {
      final value = data[key];
      return value is Timestamp ? value.toDate().toUtc() : null;
    }

    final version = data['initialPaymentDeadlinePolicyVersion'];
    // Missing/null fields are historical placeholders. A populated V4 deadline
    // without its version is incomplete V4 evidence, never a historical record.
    final historical =
        version == null && data['initialPaymentDeadlineAt'] == null;
    final versioned = version == 4;
    final stored = timestamp(
      version == null ? 'expiresAt' : 'initialPaymentDeadlineAt',
    );
    final accepted = timestamp('acceptedAt');
    final event = timestamp('eventStartAt');
    final hard = timestamp('hardPaymentDeadlineAt');
    final expiry = timestamp('expiresAt');
    final valid =
        (historical || versioned) &&
        stored != null &&
        accepted != null &&
        stored.isAfter(accepted) &&
        (historical || (versioned && event != null && expiry == stored)) &&
        (data['eventStartAt'] == null ||
            (event != null && !stored.isAfter(event))) &&
        (data['hardPaymentDeadlineAt'] == null ||
            (hard != null && !stored.isAfter(hard)));
    // Retain readable, stored historical timestamps even if authority is incomplete.
    return InitialPaymentDeadline._(stored, valid);
  }

  String? get manilaLabel {
    final deadline = at;
    if (deadline == null) return null;
    // Explicit Philippine offset; device timezone and clock do not affect display.
    final local = deadline.toUtc().add(const Duration(hours: 8));
    String two(int value) => value.toString().padLeft(2, '0');
    return '${local.year}-${two(local.month)}-${two(local.day)} '
        '${two(local.hour)}:${two(local.minute)} PHT';
  }
}
