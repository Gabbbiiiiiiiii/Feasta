import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Server-authoritative Customer cancellation client.
/// No local Firestore cancellation writes or refund calculations.
class CustomerCancellationClient {
  CustomerCancellationClient({FirebaseFunctions? functions, FirebaseAuth? auth})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'asia-southeast1'),
      _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFunctions _functions;
  final FirebaseAuth _auth;

  static final _documentId = RegExp(r'^[A-Za-z0-9_-]{8,160}$');
  static final _keyPattern = RegExp(r'^[A-Za-z0-9:_-]{8,200}$');

  static const reasonCodes = {
    'CANCELLATION_CUTOFF_PASSED',
    'EVENT_ENDED',
    'SCHEDULE_RECONCILIATION_REQUIRED',
    'ALLOWED',
    'ROLLOUT_DISABLED',
    'ACTIVE_CANCELLATION_EXISTS',
    'PROVIDER_REQUEST_STATUS_INELIGIBLE',
    'PAYMENT_REFUND_INELIGIBLE',
    'PAYMENT_RECONCILIATION_REQUIRED',
    'LEGACY_MANUAL_REVIEW',
  };

  static const cancellationStatuses = {
    'submitted',
    'awaiting_payment_resolution',
    'under_review',
    'approved',
    'rejected',
    'refund_processing',
    'refund_failed',
    'refund_completed',
    'cancelled_no_refund',
  };

  static const providerStatuses = {
    'pending',
    'accepted',
    'rejected',
    'waiting_for_down_payment',
    'payment_processing',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'expired',
  };

  static const stages = {
    'preparation_not_started',
    'preparation_started',
    'service_started',
  };

  static const refundStatuses = {
    'none',
    'manual_review',
    'approved',
    'processing',
    'failed_retry_pending',
    'failed_reconciliation_required',
    'partial_completed',
    'full_completed',
  };

  static const maxSafeInteger = 9007199254740991;

  static FormatException invalid() => const FormatException(
    'FEASTA received invalid cancellation details. Refresh and try again.',
  );

  static Map<String, dynamic> record(dynamic value) {
    if (value is! Map || value.keys.any((key) => key is! String)) {
      throw invalid();
    }
    return Map<String, dynamic>.from(value);
  }

  static String validDocumentId(dynamic value) {
    if (value is! String || !_documentId.hasMatch(value)) {
      throw invalid();
    }
    return value;
  }

  static bool validInteger(
    dynamic value, {
    int min = 0,
    int max = maxSafeInteger,
  }) => value is int && value >= min && value <= max;

  static int centavos(dynamic value) {
    if (!validInteger(value)) throw invalid();
    return value as int;
  }

  static void validDate(dynamic value) {
    if (value is! String ||
        value.length > 40 ||
        DateTime.tryParse(value) == null) {
      throw invalid();
    }
  }

  static void validateProjection(dynamic value, String expectedId) {
    final data = record(value);
    validDocumentId(data['cancellationRequestId']);

    if (data['providerRequestId'] != expectedId ||
        !cancellationStatuses.contains(data['status']) ||
        !{'policy_backed', 'legacy'}.contains(data['policyEvidenceStatus']) ||
        data['manualReviewRequired'] is! bool ||
        !{'pending', 'approved', 'rejected'}.contains(data['decisionStatus'])) {
      throw invalid();
    }

    final frozenStage = data['frozenStage'];
    if (frozenStage != null && !stages.contains(frozenStage)) {
      throw invalid();
    }
    if (data['policyEvidenceStatus'] == 'legacy' && frozenStage != null) {
      throw invalid();
    }

    final refund = record(data['refund']);
    if (!refundStatuses.contains(refund['status'])) throw invalid();

    final amount = refund['amountInCentavos'];
    final completed = refund['completedAmountInCentavos'];
    final currency = refund['currency'];

    if (amount != null) centavos(amount);
    if (completed != null) centavos(completed);
    if (currency != null && currency != 'PHP') throw invalid();
    if ((amount != null || completed != null) && currency != 'PHP') {
      throw invalid();
    }

    validDate(data['submittedAt']);
    validDate(data['updatedAt']);
  }

  static void validatePolicy(dynamic value) {
    final policy = record(value);

    final policyKey = policy['policyKey'];
    if (policyKey is! String ||
        policyKey.isEmpty ||
        policyKey.length > 180 ||
        !{
          'provider_default',
          'package_override',
        }.contains(policy['sourceKind']) ||
        !validInteger(policy['policyVersion'], min: 1)) {
      throw invalid();
    }

    final terms = policy['terms'];
    if (terms != null && (terms is! String || terms.length > 4000)) {
      throw invalid();
    }

    final rules = policy['rules'];
    if (rules is! List || rules.length != stages.length) {
      throw invalid();
    }

    final seen = <String>{};
    for (final item in rules) {
      final rule = record(item);
      final stage = rule['stage'];
      if (stage is! String ||
          !stages.contains(stage) ||
          !seen.add(stage) ||
          !validInteger(rule['refundBasisPoints'], max: 10000)) {
        throw invalid();
      }
    }
    if (seen.length != stages.length) throw invalid();
  }

  static void validatePreview(dynamic value) {
    final preview = record(value);

    if (!{
          'calculated',
          'nothing_refundable',
        }.contains(preview['calculationStatus']) ||
        !stages.contains(preview['frozenStage']) ||
        preview['currency'] != 'PHP') {
      throw invalid();
    }

    final refund = centavos(preview['refundAmountInCentavos']);
    final hasBreakdown =
        preview.containsKey('paidAmountInCentavos') ||
        preview.containsKey('nonRefundableAmountInCentavos');

    if (hasBreakdown) {
      final paid = centavos(preview['paidAmountInCentavos']);
      final nonRefundable = centavos(preview['nonRefundableAmountInCentavos']);
      if (refund + nonRefundable != paid) throw invalid();
    }
  }

  Future<Map<String, dynamic>> _call(
    String name,
    String providerRequestId, [
    Map<String, dynamic> extra = const {},
  ]) async {
    final id = validDocumentId(providerRequestId.trim());

    if (_auth.currentUser == null) {
      throw StateError('Your session has expired. Sign in again to continue.');
    }

    final response = await _functions
        .httpsCallable(
          name,
          options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
        )
        .call(<String, dynamic>{'providerRequestId': id, ...extra});

    final data = record(response.data);
    if (data['providerRequestId'] != id) throw invalid();
    return data;
  }

  Future<Map<String, dynamic>> getOptions(String providerRequestId) async {
    final data = await _call(
      'getProviderRequestCancellationOptions',
      providerRequestId,
    );

    final reasonCode = data['reasonCode'];
    final allowed = data['cancellationAllowed'];

    if (!reasonCodes.contains(reasonCode) || allowed is! bool) {
      throw invalid();
    }

    final expectedAllowed = {
      'ALLOWED',
      'PAYMENT_RECONCILIATION_REQUIRED',
      'LEGACY_MANUAL_REVIEW',
    }.contains(reasonCode);

    if (allowed != expectedAllowed) throw invalid();

    final status = data['providerRequestStatus'];
    if (status != null && !providerStatuses.contains(status)) {
      throw invalid();
    }

    final expiry = data['eligibilityExpiresInMs'];
    if (expiry != null && !validInteger(expiry)) throw invalid();

    final cutoffAt = data['cancellationCutoffAt'];
    if (cutoffAt != null) validDate(cutoffAt);

    final cutoffHours = data['cancellationCutoffHours'];
    if (cutoffHours != null && !validInteger(cutoffHours, min: 1)) {
      throw invalid();
    }

    final active = data['activeCancellation'];
    if (active != null) {
      validateProjection(active, data['providerRequestId'] as String);
      if (allowed) throw invalid();
    }

    if (reasonCode == 'ACTIVE_CANCELLATION_EXISTS' && active == null) {
      throw invalid();
    }

    final policy = data['policy'];
    final preview = data['refundPreview'];

    if (policy != null) validatePolicy(policy);
    if (preview != null) validatePreview(preview);

    if (preview != null && policy == null) throw invalid();

    if (reasonCode == 'LEGACY_MANUAL_REVIEW' &&
        (policy != null || preview != null)) {
      throw invalid();
    }

    return data;
  }

  Future<Map<String, dynamic>> getStatus(String providerRequestId) async {
    final data = await _call(
      'getProviderRequestCancellationStatus',
      providerRequestId,
    );

    if (!data.containsKey('cancellation')) throw invalid();

    if (data['cancellation'] != null) {
      validateProjection(
        data['cancellation'],
        data['providerRequestId'] as String,
      );
    }

    return data;
  }

  String createIdempotencyKey() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    final suffix = bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
    return 'customer-cancellation:$suffix';
  }

  Future<Map<String, dynamic>> submit({
    required String providerRequestId,
    required String reason,
    required String idempotencyKey,
    required bool acknowledged,
  }) async {
    final normalized = reason.trim();

    if (normalized.length < 5 || normalized.length > 1000) {
      throw const FormatException(
        'Enter a cancellation reason between 5 and 1,000 characters.',
      );
    }
    if (!acknowledged) {
      throw const FormatException(
        'Acknowledge the refund policy before submitting.',
      );
    }
    if (!_keyPattern.hasMatch(idempotencyKey)) {
      throw const FormatException('Invalid secure cancellation reference.');
    }

    final data = await _call(
      'submitProviderRequestCancellation',
      providerRequestId,
      {
        'reason': normalized,
        'idempotencyKey': idempotencyKey,
        'acknowledged': true,
      },
    );

    validDocumentId(data['cancellationRequestId']);

    if (!cancellationStatuses.contains(data['status']) ||
        !{'policy_backed', 'legacy'}.contains(data['policyEvidenceStatus']) ||
        data['manualReviewRequired'] is! bool ||
        data['created'] is! bool) {
      throw invalid();
    }

    final frozen = data['frozenEligibility'];
    if (data['policyEvidenceStatus'] == 'legacy') {
      if (frozen != null) throw invalid();
    } else {
      final evidence = record(frozen);
      if (!stages.contains(evidence['stage']) ||
          !validInteger(evidence['stageSequence'])) {
        throw invalid();
      }
    }

    return data;
  }
}
