import 'dart:convert';
import 'booking_contract.dart';
import 'package:cloud_functions/cloud_functions.dart';

class AgreementReviewFailure implements Exception {
  const AgreementReviewFailure(this.message, {this.reconciliation = false});
  final String message;
  final bool reconciliation;
}

AgreementReviewFailure agreementReviewFailure(Object error) {
  if (error is AgreementReviewFailure) return error;
  if (error is FirebaseFunctionsException) {
    final details = error.details;
    final reason = details is Map ? details['reason'] : null;
    if (reason == 'BOOKING_PAYMENT_AGREEMENT_CHANGED') {
      return const AgreementReviewFailure(
        'Booking terms changed. Reload and review every current agreement again.',
      );
    }
    if (reason == 'BOOKING_PAYMENT_AGREEMENT_REQUIRED') {
      return const AgreementReviewFailure(
        'Review and acknowledge each current Booking & Payment Agreement.',
      );
    }
    return AgreementReviewFailure(switch (error.code) {
      'unauthenticated' => 'Sign in again to review your booking agreements.',
      'permission-denied' =>
        'Check your email and phone verification and account eligibility, then try again.',
      'not-found' =>
        'The provider or package is unavailable. Return to your selections and choose an available service.',
      'failed-precondition' =>
        'Your account, event date, or selected services need review. Check verification and current package availability before retrying.',
      'deadline-exceeded' =>
        'Agreement review timed out. Check your connection and retry.',
      'unavailable' =>
        'Cannot load current agreements. Check your connection and retry.',
      'resource-exhausted' =>
        'Too many review requests. Wait a moment, then retry.',
      'invalid-argument' =>
        'Review your event details and selections, then try again.',
      _ => 'Current booking agreements could not be loaded. Please retry.',
    });
  }
  return const AgreementReviewFailure(
    'Current booking agreements could not be loaded. Check your connection and retry.',
  );
}

/// Public disclosure only. Authoritative money and timing always come from the server.
class BookingAgreement {
  BookingAgreement._(this._data);
  final Map<String, dynamic> _data;
  String get providerId => _data['providerId'] as String;
  String get providerName => _data['providerName'] as String;
  String get agreementKey => _data['agreementKey'] as String;
  List<String> get serviceNames => _data['serviceNames'] as List<String>;
  String? get serviceTierLabel => _data['serviceTierLabel'] as String?;
  bool get depositEligible => _data['depositEligible'] as bool;
  String? get eligibilityReason => _data['eligibilityReason'] as String?;
  int get gross => _data['grossAmountInCentavos'] as int;
  int get upfront => _data['requiredUpfrontAmountInCentavos'] as int;
  int get remaining => _data['remainingBalanceInCentavos'] as int;
  Map<String, int>? get allocation =>
      _data['paymentDefaultAllocation'] as Map<String, int>?;
  DateTime time(String field) => DateTime.parse(_data[field] as String);
  Map<String, String> get acknowledgement => {
    'providerId': providerId,
    'agreementKey': agreementKey,
  };

  static const fields = {
    'schemaVersion',
    'timingSchemaVersion',
    'agreementKey',
    'providerId',
    'providerName',
    'serviceNames',
    'serviceTierLabel',
    'eventStartAt',
    'depositEligibilityCutoffAt',
    'remainingBalanceDueAt',
    'hardPaymentDeadlineAt',
    'preparationStartsAt',
    'grossAmountInCentavos',
    'requiredUpfrontAmountInCentavos',
    'remainingBalanceInCentavos',
    'depositEligible',
    'eligibilityReason',
    'paymentDefaultAllocation',
  };
  static const allocationFields = {
    'schemaVersion',
    'paidDepositInCentavos',
    'customerRefundRateBps',
    'providerReservationCompRateBps',
    'feastaCancellationFeeRateBps',
    'customerDefaultRefundAmountInCentavos',
    'providerReservationCompAmountInCentavos',
    'feastaCancellationFeeAmountInCentavos',
  };
  static bool _money(Object? value) =>
      value is int && value >= 0 && value <= 9007199254740991;
  static bool _text(Object? value, int max) =>
      value is String && value.trim().isNotEmpty && value.length <= max;
  static Never _invalid() => throw const AgreementReviewFailure(
    'The server returned incomplete or invalid agreement terms. Reload to review current terms.',
  );

  factory BookingAgreement.fromJson(Object? value) {
    if (value is! Map || value.keys.any((key) => !fields.contains(key))) {
      _invalid();
    }
    final data = Map<String, dynamic>.from(value);
    if (data['schemaVersion'] != 1 ||
        data['schemaVersion'] is! int ||
        data['timingSchemaVersion'] != 3 ||
        data['timingSchemaVersion'] is! int ||
        data['agreementKey'] is! String ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(data['agreementKey'] as String) ||
        !_text(data['providerId'], 160) ||
        (data['providerId'] as String).contains('/') ||
        !_text(data['providerName'], 500) ||
        data['depositEligible'] is! bool ||
        !data.containsKey('serviceTierLabel') ||
        (data['serviceTierLabel'] != null &&
            !_text(data['serviceTierLabel'], 200)) ||
        (data['eligibilityReason'] != null &&
            !_text(data['eligibilityReason'], 120))) {
      _invalid();
    }
    final names = data['serviceNames'];
    if (names is! List ||
        names.isEmpty ||
        names.length > 32 ||
        names.any((name) => !_text(name, 200))) {
      _invalid();
    }
    data['serviceNames'] = List<String>.unmodifiable(names);
    for (final field in [
      'grossAmountInCentavos',
      'requiredUpfrontAmountInCentavos',
      'remainingBalanceInCentavos',
    ]) {
      if (!_money(data[field])) _invalid();
    }
    final gross = data['grossAmountInCentavos'] as int;
    final upfront = data['requiredUpfrontAmountInCentavos'] as int;
    final remaining = data['remainingBalanceInCentavos'] as int;
    if (gross <= 0 || upfront <= 0 || upfront + remaining != gross) _invalid();
    DateTime parseTime(String field) {
      final v = data[field];
      if (v is! String) _invalid();
      final parsed = DateTime.tryParse(v);
      if (parsed == null || !parsed.isUtc || parsed.toIso8601String() != v) {
        _invalid();
      }
      return parsed;
    }

    final event = parseTime('eventStartAt');
    for (final entry in {
      'depositEligibilityCutoffAt': 72,
      'remainingBalanceDueAt': 48,
      'hardPaymentDeadlineAt': 24,
      'preparationStartsAt': 24,
    }.entries) {
      if (parseTime(entry.key) !=
          event.subtract(Duration(hours: entry.value))) {
        _invalid();
      }
    }
    final allocation = data['paymentDefaultAllocation'];
    if (data['depositEligible'] == true) {
      if (upfront >= gross ||
          allocation is! Map ||
          allocation.length != allocationFields.length ||
          allocation.keys.any((key) => !allocationFields.contains(key)) ||
          allocation.values.any((v) => !_money(v))) {
        _invalid();
      }
      if (allocation['schemaVersion'] != 1 ||
          allocation['paidDepositInCentavos'] != upfront ||
          allocation['customerRefundRateBps'] != 7000 ||
          allocation['providerReservationCompRateBps'] != 2000 ||
          allocation['feastaCancellationFeeRateBps'] != 1000) {
        _invalid();
      }
      final refund = allocation['customerDefaultRefundAmountInCentavos'] as int;
      final provider =
          allocation['providerReservationCompAmountInCentavos'] as int;
      if (refund != upfront * 7 ~/ 10 ||
          provider != upfront * 2 ~/ 10 ||
          allocation['feastaCancellationFeeAmountInCentavos'] !=
              upfront - refund - provider) {
        _invalid();
      }
      data['paymentDefaultAllocation'] = Map<String, int>.unmodifiable(
        allocation,
      );
    } else if (allocation != null ||
        !data.containsKey('paymentDefaultAllocation') ||
        remaining != 0) {
      _invalid();
    }
    return BookingAgreement._(Map.unmodifiable(data));
  }
}

List<BookingAgreement> parseAgreementDisclosures(Object? response) {
  if (response is! Map || !response.containsKey('agreements')) {
    throw const AgreementReviewFailure(
      'This review returned no agreement disclosures. Return to your booking history to reconcile an existing request, or reopen your selections for a fresh review.',
      reconciliation: true,
    );
  }
  bool id(Object? value) =>
      value is String && RegExp(r'^[A-Za-z0-9_-]{8,160}$').hasMatch(value);
  final raw = response['agreements'];
  if (!id(response['bookingId']) ||
      response['mainEventId'] != response['bookingId'] ||
      response['created'] != false ||
      response['providerRequestIds'] is! List ||
      (response['providerRequestIds'] as List).isNotEmpty ||
      raw is! List ||
      raw.isEmpty ||
      raw.length > 21) {
    throw const AgreementReviewFailure(
      'Agreement disclosures are incomplete. Reload to review current terms.',
    );
  }
  final agreements = raw.map(BookingAgreement.fromJson).toList();
  if (agreements.map((a) => a.providerId).toSet().length != agreements.length) {
    throw const AgreementReviewFailure(
      'Agreement providers are duplicated. Reload to review current terms.',
    );
  }
  return List.unmodifiable(agreements);
}

String agreementMoney(int centavos) {
  final whole = (centavos ~/ 100).toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
    (m) => '${m[1]},',
  );
  return 'PHP $whole.${(centavos % 100).toString().padLeft(2, '0')}';
}

String agreementTime(DateTime instant) {
  final m = instant.toUtc().add(const Duration(hours: 8));
  String two(int value) => value.toString().padLeft(2, '0');
  return '${m.year}-${two(m.month)}-${two(m.day)} ${two(m.hour)}:${two(m.minute)} (Asia/Manila)';
}

/// Immutable, transient disclosure context. Never a durable submission attempt.
class BookingAgreementRequest {
  BookingAgreementRequest(BookingSelection selection, this.clientRequestId)
    : _json = jsonEncode(selection.toJson(clientRequestId: clientRequestId)),
      _addonOwnership = List.unmodifiable(
        selection.customization.selectedAddOns.map(
          (addon) => Map<String, Object?>.unmodifiable({
            'addonId': addon['addonId'],
            'providerId': addon['providerId'],
            'source': addon['source'],
          }),
        ),
      );
  final String clientRequestId;
  final String _json;
  final List<Map<String, Object?>> _addonOwnership;
  Map<String, dynamic> toJson() => jsonDecode(_json) as Map<String, dynamic>;

  /// Local ownership is only a comparison snapshot, never ownership authority.
  /// The production lookup reads current eligible add-ons from the server.
  Future<Set<String>> expectedProviderIds({
    Future<String?> Function(String addonId)? lookupOwner,
  }) async {
    const failure = AgreementReviewFailure(
      'Provider agreements need to be refreshed. Return to your selections to review current add-on providers, then reload agreements.',
    );
    final payload = toJson();
    final catering = payload['providerId'] as String;
    final providers = <String>{catering};
    final owners = <String, String>{};
    for (final addon in _addonOwnership) {
      final rawId = addon['addonId'];
      final owner = addon['providerId'];
      if (rawId is! String ||
          owner is! String ||
          !RegExp(r'^[A-Za-z0-9_-]{8,160}$').hasMatch(owner) ||
          addon['source'] !=
              (owner == catering
                  ? 'catering_provider'
                  : 'feasta_addon_provider')) {
        throw failure;
      }
      final id = rawId.trim();
      if (owners.containsKey(id) && owners[id] != owner) throw failure;
      owners[id] = owner;
    }
    final ids = (payload['addonIds'] as List).cast<String>();
    if (owners.length != ids.length) throw failure;
    for (final id in ids) {
      if (lookupOwner == null) throw failure;
      final currentOwner = await lookupOwner(id);
      if (currentOwner == null || currentOwner != owners[id]) throw failure;
      providers.add(currentOwner);
    }
    return Set.unmodifiable(providers);
  }
}

String agreementSelectionSignature(BookingSelection selection, String? owner) {
  Object? canonical(Object? value) {
    if (value is Map) {
      final keys = value.keys.map((key) => key.toString()).toList()..sort();
      return {for (final key in keys) key: canonical(value[key])};
    }
    if (value is List) return value.map(canonical).toList();
    if (value is num) return value.isFinite ? value : value.toString();
    if (value == null || value is String || value is bool) {
      return value;
    }
    return value.toString();
  }

  // Include local add-on provider/quantity/context edits even when transport
  // currently supports only IDs. These fields are never sent to the callable.
  return jsonEncode(
    canonical({
      'owner': owner,
      'selection': selection.toJson(clientRequestId: 'selection_signature'),
      'addonContext': selection.customization.selectedAddOns,
    }),
  );
}
