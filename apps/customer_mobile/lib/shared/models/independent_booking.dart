import 'feasta_models.dart';

Never _invalid() => throw const FormatException(
  'Provider booking information is incomplete. Refresh this booking or contact FEASTA support.',
);

String _text(Object? value) {
  if (value is! String || value.trim().isEmpty) _invalid();
  return value;
}

String _id(Object? value) {
  final id = _text(value);
  if (!RegExp(r'^[A-Za-z0-9_-]{8,160}$').hasMatch(id)) _invalid();
  return id;
}

Map<String, dynamic> _map(Object? value) {
  if (value is! Map<String, dynamic>) _invalid();
  return value;
}

int _money(Object? value) {
  if (value is! num || !value.isFinite || value < 0 || value > 100000000) {
    _invalid();
  }
  final scaled = value * 100;
  if ((scaled - scaled.round()).abs() > 0.00001) _invalid();
  return scaled.round();
}

int? _centavos(Object? value) =>
    value is int && value >= 0 && value <= 10000000000 ? value : null;

/// Read projection of immutable parent assignment snapshots. No status or
/// payment state is inferred from these snapshots or from the first provider.
class IndependentBookingAssignment {
  IndependentBookingAssignment._(
    this.requestId,
    this.providerId,
    this.kind,
    this.selectionId,
    this.amountInCentavos,
  );
  final String requestId, providerId, kind, selectionId;
  final int amountInCentavos;
  bool get marketplace => kind == 'marketplace_service';
}

class IndependentBooking {
  IndependentBooking._(this.assignments, this.totalInCentavos);
  final List<IndependentBookingAssignment> assignments;
  final int totalInCentavos;
  int get cateringInCentavos => assignments
      .where((a) => !a.marketplace)
      .fold(0, (total, a) => total + a.amountInCentavos);
  int get marketplaceInCentavos => totalInCentavos - cateringInCentavos;

  factory IndependentBooking.fromBooking(BookingModel booking) {
    final mixed = booking.hasIndependentProviderAssignments;
    final data = booking.lifecycleData;
    if (data['packageAssignmentVersion'] != (mixed ? 2 : 1)) _invalid();
    final rows = data[mixed ? 'providerAssignments' : 'packageAssignments'];
    final ids = booking.providerRequestIds;
    if (rows is! List ||
        rows.isEmpty ||
        rows.length > 4 ||
        rows.length != ids.length ||
        ids.toSet().length != ids.length) {
      _invalid();
    }
    final providers = <String>{}, requests = <String>{};
    final assignments = <IndependentBookingAssignment>[];
    for (final value in rows) {
      final row = _map(value);
      final requestId = _id(row['providerRequestId']);
      final providerId = _id(row['providerId']);
      final kind = mixed ? row['kind'] : 'catering_package';
      if (!['catering_package', 'marketplace_service'].contains(kind) ||
          !ids.contains(requestId) ||
          !requests.add(requestId) ||
          !providers.add(providerId)) {
        _invalid();
      }
      final marketplace = kind == 'marketplace_service';
      if (marketplace && row['packageId'] != null) _invalid();
      final selectionId = _id(row[marketplace ? 'serviceId' : 'packageId']);
      assignments.add(
        IndependentBookingAssignment._(
          requestId,
          providerId,
          kind as String,
          selectionId,
          _money(row['amount']),
        ),
      );
    }
    if (mixed &&
        (!assignments.any((a) => a.marketplace) ||
            !assignments.any((a) => !a.marketplace))) {
      _invalid();
    }
    final total = assignments.fold(0, (sum, a) => sum + a.amountInCentavos);
    if (_money(data['totalAmount']) != total ||
        _money(booking.totalAmount) != total) {
      _invalid();
    }
    return IndependentBooking._(List.unmodifiable(assignments), total);
  }

  List<IndependentProviderBooking> readRequests(
    BookingModel booking,
    Map<String, Map<String, dynamic>> records,
  ) {
    if (records.length != assignments.length) _invalid();
    return List.unmodifiable([
      for (final assignment in assignments)
        IndependentProviderBooking._read(
          booking,
          assignment,
          records[assignment.requestId] ?? _invalid(),
        ),
    ]);
  }
}

class IndependentProviderBooking {
  IndependentProviderBooking._(
    this.assignment,
    this.providerName,
    this.serviceName,
    this.category,
    this.status,
    this.paymentStatus,
    this.settlementStatus,
    this.settledInCentavos,
    this.outstandingInCentavos,
    this.reviewRequired,
  );
  final IndependentBookingAssignment assignment;
  final String providerName, serviceName, category;
  final String? status, paymentStatus, settlementStatus;
  final int? settledInCentavos, outstandingInCentavos;
  final bool reviewRequired;

  static IndependentProviderBooking _read(
    BookingModel booking,
    IndependentBookingAssignment assignment,
    Map<String, dynamic> row,
  ) {
    if (row['providerRequestId'] != assignment.requestId ||
        row['mainEventId'] != booking.id ||
        row['bookingId'] != booking.id ||
        row['customerId'] != booking.customerId ||
        row['providerId'] != assignment.providerId ||
        row['type'] != (assignment.marketplace ? 'addon' : 'catering') ||
        row[assignment.marketplace ? 'serviceId' : 'packageId'] !=
            assignment.selectionId ||
        (assignment.marketplace && row['packageId'] != null) ||
        _money(row['amount']) != assignment.amountInCentavos) {
      _invalid();
    }
    final services = row['services'];
    if (services is! List || services.length != 1) _invalid();
    final service = _map(services.single);
    if (service['serviceId'] != assignment.selectionId ||
        _money(service['price']) != assignment.amountInCentavos) {
      _invalid();
    }
    final snapshot = row['financialSnapshot'];
    if (snapshot != null) {
      final financial = _map(snapshot);
      final gross = _centavos(financial['grossAmountInCentavos']);
      final upfront = _centavos(financial['requiredUpfrontAmountInCentavos']);
      final balance = _centavos(financial['remainingBalanceInCentavos']);
      if (financial['schemaVersion'] != 1 ||
          financial['currency'] != 'PHP' ||
          gross != assignment.amountInCentavos ||
          upfront == null ||
          balance == null ||
          upfront + balance != gross) {
        _invalid();
      }
    }
    const settlementStatuses = {
      'unpaid',
      'initial_payment_processing',
      'deposit_settled',
      'balance_payment_processing',
      'fully_settled',
    };
    int? settled, outstanding;
    if (row['settlementSchemaVersion'] != null ||
        row['settlementStatus'] != null ||
        row['grossSettledAmountInCentavos'] != null ||
        row['outstandingAmountInCentavos'] != null) {
      settled = _centavos(row['grossSettledAmountInCentavos']);
      outstanding = _centavos(row['outstandingAmountInCentavos']);
      if (row['settlementSchemaVersion'] != 1 ||
          !settlementStatuses.contains(row['settlementStatus']) ||
          settled == null ||
          outstanding == null ||
          settled + outstanding != assignment.amountInCentavos) {
        _invalid();
      }
    }
    const statuses = {
      'pending',
      'accepted',
      'rejected',
      'waiting_for_down_payment',
      'waiting_payment',
      'payment_processing',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
      'expired',
    };
    const payments = {
      'unpaid',
      'pending',
      'processing',
      'paid',
      'partially_paid',
      'failed',
      'expired',
      'cancelled',
      'partially_refunded',
      'refunded',
    };
    return IndependentProviderBooking._(
      assignment,
      _text(row['providerBusinessName']),
      _text(service['name']),
      _text(service['category']),
      statuses.contains(row['status']) ? row['status'] as String : null,
      payments.contains(row['paymentStatus'])
          ? row['paymentStatus'] as String
          : null,
      row['settlementStatus'] as String?,
      settled,
      outstanding,
      row['reconciliationRequired'] == true ||
          row['lifecycleReconciliationRequired'] == true ||
          row['initialPaymentReview'] != null ||
          row['activeCancellationRequestId'] != null,
    );
  }
}
