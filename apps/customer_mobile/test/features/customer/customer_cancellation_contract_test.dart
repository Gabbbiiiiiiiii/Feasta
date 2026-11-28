import 'package:flutter_test/flutter_test.dart';

import 'package:feasta/features/customer/customer_cancellation_client.dart';

void main() {
  const requestId = 'provider_request_123';

  Map<String, dynamic> policy() => {
    'policyKey': 'default-policy',
    'sourceKind': 'provider_default',
    'policyVersion': 1,
    'terms': null,
    'rules': [
      {'stage': 'preparation_not_started', 'refundBasisPoints': 10000},
      {'stage': 'preparation_started', 'refundBasisPoints': 5000},
      {'stage': 'service_started', 'refundBasisPoints': 0},
    ],
  };

  Map<String, dynamic> projection() => {
    'cancellationRequestId': 'cancellation_123',
    'providerRequestId': requestId,
    'status': 'under_review',
    'policyEvidenceStatus': 'policy_backed',
    'frozenStage': 'preparation_not_started',
    'manualReviewRequired': false,
    'decisionStatus': 'pending',
    'refund': {
      'status': 'none',
      'amountInCentavos': null,
      'completedAmountInCentavos': null,
      'currency': null,
    },
    'submittedAt': '2026-11-18T00:00:00.000Z',
    'updatedAt': '2026-11-18T00:00:00.000Z',
  };

  group('Cancellation policy contract', () {
    test('accepts valid recorded policy', () {
      expect(
        () => CustomerCancellationClient.validatePolicy(policy()),
        returnsNormally,
      );
    });

    test('rejects missing refund stage', () {
      final value = policy();
      (value['rules'] as List).removeLast();

      expect(
        () => CustomerCancellationClient.validatePolicy(value),
        throwsFormatException,
      );
    });

    test('rejects duplicate refund stage', () {
      final value = policy();
      final rules = value['rules'] as List;
      rules[1] = {
        'stage': 'preparation_not_started',
        'refundBasisPoints': 5000,
      };

      expect(
        () => CustomerCancellationClient.validatePolicy(value),
        throwsFormatException,
      );
    });

    test('rejects invalid percentage', () {
      final value = policy();
      (value['rules'] as List)[0]['refundBasisPoints'] = 10001;

      expect(
        () => CustomerCancellationClient.validatePolicy(value),
        throwsFormatException,
      );
    });
  });

  group('Refund preview contract', () {
    test('accepts server-provided centavo breakdown', () {
      expect(
        () => CustomerCancellationClient.validatePreview({
          'calculationStatus': 'calculated',
          'frozenStage': 'preparation_not_started',
          'refundAmountInCentavos': 7500,
          'paidAmountInCentavos': 10000,
          'nonRefundableAmountInCentavos': 2500,
          'currency': 'PHP',
        }),
        returnsNormally,
      );
    });

    test('rejects inconsistent refund totals', () {
      expect(
        () => CustomerCancellationClient.validatePreview({
          'calculationStatus': 'calculated',
          'frozenStage': 'preparation_not_started',
          'refundAmountInCentavos': 8000,
          'paidAmountInCentavos': 10000,
          'nonRefundableAmountInCentavos': 2500,
          'currency': 'PHP',
        }),
        throwsFormatException,
      );
    });

    test('rejects negative refund amount', () {
      expect(
        () => CustomerCancellationClient.validatePreview({
          'calculationStatus': 'calculated',
          'frozenStage': 'preparation_not_started',
          'refundAmountInCentavos': -1,
          'currency': 'PHP',
        }),
        throwsFormatException,
      );
    });
  });

  group('Cancellation projection contract', () {
    test('accepts trusted cancellation state', () {
      expect(
        () => CustomerCancellationClient.validateProjection(
          projection(),
          requestId,
        ),
        returnsNormally,
      );
    });

    test('rejects different provider request identity', () {
      expect(
        () => CustomerCancellationClient.validateProjection(
          projection(),
          'different_provider_456',
        ),
        throwsFormatException,
      );
    });

    test('rejects unknown cancellation status', () {
      final value = projection();
      value['status'] = 'automatically_refunded';

      expect(
        () => CustomerCancellationClient.validateProjection(value, requestId),
        throwsFormatException,
      );
    });

    test('rejects unsupported refund currency', () {
      final value = projection();
      (value['refund'] as Map<String, dynamic>)['currency'] = 'USD';

      expect(
        () => CustomerCancellationClient.validateProjection(value, requestId),
        throwsFormatException,
      );
    });

    test('rejects invalid legacy frozen eligibility', () {
      final value = projection();
      value['policyEvidenceStatus'] = 'legacy';

      expect(
        () => CustomerCancellationClient.validateProjection(value, requestId),
        throwsFormatException,
      );
    });
  });
}
