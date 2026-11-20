import 'package:cloud_functions/cloud_functions.dart';
import 'booking_agreement.dart';

class RefundReviewFailure implements Exception {
  const RefundReviewFailure(this.message);
  final String message;
}

RefundReviewFailure refundReviewFailure(Object error) {
  if (error is RefundReviewFailure) return error;
  if (error is AgreementReviewFailure) {
    return const RefundReviewFailure(
      'Selected service ownership or availability changed. Return to your selections, then reload refund policies.',
    );
  }
  if (error is FirebaseFunctionsException) {
    final reason = error.details is Map ? error.details['reason'] : null;
    final message = switch (reason) {
      'REFUND_POLICY_REQUIRED' =>
        'A selected provider has no published refund policy. Choose an available service or retry after the provider updates it.',
      'REFUND_POLICY_INVALID' =>
        'Refund policy configuration is unavailable. Retry later or choose another service.',
      'REFUND_POLICY_CHANGED' =>
        'A refund policy changed. Reload and review every current policy again.',
      'REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED' ||
      'REFUND_POLICY_ACKNOWLEDGEMENT_INVALID' =>
        'Reload and explicitly acknowledge every current provider refund policy.',
      _ => switch (error.code) {
        'unauthenticated' => 'Sign in again to review refund policies.',
        'permission-denied' =>
          'Check your account verification and eligibility, then retry.',
        'not-found' || 'failed-precondition' =>
          'A selected service or policy is unavailable. Return to your selections or retry later.',
        'deadline-exceeded' =>
          'Refund policy loading timed out. Check your connection and retry.',
        'resource-exhausted' =>
          'Too many review requests. Wait a moment, then retry.',
        _ =>
          'Refund policies could not be loaded. Check your connection and retry.',
      },
    };
    return RefundReviewFailure(message);
  }
  return const RefundReviewFailure(
    'Refund policies could not be loaded. Check your connection and retry.',
  );
}

Never _invalid() => throw const RefundReviewFailure(
  'The server returned invalid or incomplete refund policies. Reload or return to your selections.',
);
Map _record(Object? value, Set<String> fields) {
  if (value is! Map ||
      value.length != fields.length ||
      value.keys.any((k) => !fields.contains(k))) {
    _invalid();
  }
  return value;
}

const refundStages = [
  'preparation_not_started',
  'preparation_started',
  'service_started',
];
const refundStageLabels = [
  'Before preparation starts',
  'After preparation starts',
  'After service starts',
];
String refundPercentage(int basisPoints) =>
    '${(basisPoints / 100).toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '')}%';

class RefundRule {
  const RefundRule(this.stage, this.refundBasisPoints);
  final String stage;
  final int refundBasisPoints;
}

class BookingRefundPolicy {
  BookingRefundPolicy._(
    this.providerId,
    this.providerName,
    this.effectivePolicyKey,
    this.sourceKind,
    this.policyVersion,
    this.rules,
    this.terms,
  );
  final String providerId, providerName, effectivePolicyKey, sourceKind;
  final int policyVersion;
  final List<RefundRule> rules;
  final String? terms;
  Map<String, String> get acknowledgement => Map.unmodifiable({
    'providerId': providerId,
    'effectivePolicyKey': effectivePolicyKey,
  });
  factory BookingRefundPolicy.fromJson(Object? value) {
    final v = _record(value, {
      'providerId',
      'providerName',
      'effectivePolicyKey',
      'sourceKind',
      'policyVersion',
      'rules',
      'terms',
    });
    final id = v['providerId'],
        name = v['providerName'],
        key = v['effectivePolicyKey'],
        source = v['sourceKind'],
        version = v['policyVersion'],
        terms = v['terms'];
    if (id is! String ||
        !RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(id) ||
        name is! String ||
        name.trim().isEmpty ||
        name.length > 160 ||
        key is! String ||
        key.length > 180 ||
        !RegExp(r'^[A-Za-z0-9_:-]+$').hasMatch(key) ||
        !['provider_default', 'package_override'].contains(source) ||
        version is! int ||
        version < 1 ||
        version > 9007199254740991 ||
        (terms != null && (terms is! String || terms.length > 4000))) {
      _invalid();
    }
    // Validate server key metadata without constructing a policy key locally.
    final parts = key.split(':');
    if (parts.length != 3 ||
        parts[0] != source ||
        !RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(parts[1]) ||
        parts[2] != 'v$version' ||
        (source == 'provider_default' && parts[1] != id)) {
      _invalid();
    }
    final raw = v['rules'];
    if (raw is! List || raw.length != 3) _invalid();
    final rules = <String, RefundRule>{};
    for (final candidate in raw) {
      final r = _record(candidate, {'stage', 'refundBasisPoints'});
      final stage = r['stage'], rate = r['refundBasisPoints'];
      if (stage is! String ||
          !refundStages.contains(stage) ||
          rules.containsKey(stage) ||
          rate is! int ||
          rate < 0 ||
          rate > 10000) {
        _invalid();
      }
      rules[stage] = RefundRule(stage, rate);
    }
    return BookingRefundPolicy._(
      id,
      name,
      key,
      source as String,
      version,
      List.unmodifiable(refundStages.map((s) => rules[s]!)),
      terms as String?,
    );
  }
}

class RefundDisclosures {
  RefundDisclosures._(
    this.rolloutMode,
    this.acknowledgementsRequired,
    this.policies,
  );
  final String rolloutMode;
  final bool acknowledgementsRequired;
  final List<BookingRefundPolicy> policies;
  factory RefundDisclosures.fromJson(Object? value) {
    final v = _record(value, {
      'rolloutMode',
      'acknowledgementsRequired',
      'policies',
    });
    final mode = v['rolloutMode'],
        required = v['acknowledgementsRequired'],
        raw = v['policies'];
    if (!['off', 'required'].contains(mode) ||
        required is! bool ||
        required != (mode == 'required') ||
        raw is! List ||
        raw.isEmpty ||
        raw.length > 21) {
      _invalid();
    }
    final policies = raw.map(BookingRefundPolicy.fromJson).toList();
    if (policies.map((p) => p.providerId).toSet().length != policies.length) {
      _invalid();
    }
    return RefundDisclosures._(
      mode as String,
      required,
      List.unmodifiable(policies),
    );
  }
}

/// Narrow transport projection of the immutable, validated M4.2 snapshot.
Map<String, dynamic> refundDisclosureRequest(BookingAgreementRequest request) {
  final json = request.toJson();
  return {
    for (final key in [
      'providerId',
      'packageId',
      'addonIds',
      'cateringSelectionType',
    ])
      key: json[key],
  };
}
