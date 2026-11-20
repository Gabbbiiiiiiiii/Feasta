// Dart port of apps/web/src/lib/payments/booking-payment-projection.ts.
// Canonical settlement snapshots must never fall back to a stale transaction
// paymentStatus when present.

bool hasBookingSettlement(Map<String, dynamic> data) {
  return data['settlementSchemaVersion'] != null ||
      data['settlementStatus'] != null ||
      data['grossSettledAmountInCentavos'] != null ||
      data['outstandingAmountInCentavos'] != null;
}

/// Returns `unpaid`, `partially_paid`, or `paid` when the settlement snapshot is
/// valid; otherwise `null`.
String? projectBookingPayment(Map<String, dynamic> data) {
  final financial = _map(data['financialSnapshot']);
  final settlementSchemaVersion = data['settlementSchemaVersion'];
  final financialSchemaVersion = financial?['schemaVersion'];

  if ((settlementSchemaVersion != null && settlementSchemaVersion != 1) ||
      (financialSchemaVersion != null && financialSchemaVersion != 1)) {
    return null;
  }

  final gross = _nonNegativeSafeInt(financial?['grossAmountInCentavos']);
  final settled = _nonNegativeSafeInt(data['grossSettledAmountInCentavos']);
  final outstanding = _nonNegativeSafeInt(data['outstandingAmountInCentavos']);

  if (gross == null ||
      settled == null ||
      outstanding == null ||
      gross <= 0 ||
      settled + outstanding != gross) {
    return null;
  }

  final status = settled == 0
      ? 'unpaid'
      : outstanding == 0
      ? 'paid'
      : 'partially_paid';

  final allowed = status == 'unpaid'
      ? const {'unpaid', 'initial_payment_processing'}
      : status == 'paid'
      ? const {'fully_settled'}
      : const {'deposit_settled', 'balance_payment_processing'};

  return allowed.contains('${data['settlementStatus']}') ? status : null;
}

/// Matches web `mapProviderRequestDocument` paymentStatus resolution.
String resolveCustomerProviderPaymentStatus(Map<String, dynamic> data) {
  final paymentStatus = data['paymentStatus'];
  final raw = paymentStatus is String ? paymentStatus : null;

  if (raw == 'refunded' || raw == 'partially_refunded') {
    return raw!;
  }

  if (hasBookingSettlement(data)) {
    return projectBookingPayment(data) ?? 'unavailable';
  }

  return raw ?? 'unpaid';
}

/// Aggregate provider-request payment statuses for booking-level badges.
String aggregateCustomerPaymentStatus({
  required String bookingPaymentStatus,
  required Iterable<String> providerPaymentStatuses,
}) {
  final statuses = providerPaymentStatuses
      .map((value) => value.trim())
      .where((value) => value.isNotEmpty)
      .toList(growable: false);

  if (statuses.isEmpty) {
    return bookingPaymentStatus.isEmpty ? 'unpaid' : bookingPaymentStatus;
  }

  if (statuses.any((status) => status == 'unavailable')) {
    return 'unavailable';
  }

  const settlementLike = {'unpaid', 'partially_paid', 'paid'};
  if (statuses.every(settlementLike.contains)) {
    if (statuses.every((status) => status == 'paid')) {
      return 'paid';
    }
    if (statuses.every((status) => status == 'unpaid')) {
      return 'unpaid';
    }
    return 'partially_paid';
  }

  if (statuses.length == 1) {
    return statuses.single;
  }

  return bookingPaymentStatus.isEmpty ? 'unpaid' : bookingPaymentStatus;
}

Map<String, dynamic>? _map(dynamic value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map((key, nested) => MapEntry('$key', nested));
  }
  return null;
}

int? _nonNegativeSafeInt(dynamic value) {
  if (value is int) {
    return value >= 0 && value <= 9007199254740991 ? value : null;
  }
  if (value is num) {
    if (!value.isFinite || value != value.roundToDouble()) {
      return null;
    }
    final asInt = value.toInt();
    return asInt >= 0 && asInt <= 9007199254740991 ? asInt : null;
  }
  return null;
}
