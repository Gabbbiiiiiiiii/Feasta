import 'package:feasta/features/customer/booking_refund_policy_terms.dart';
import 'package:feasta/features/customer/customer_cancellation_attempt_store.dart';
import 'package:feasta/features/customer/customer_cancellation_client.dart';
import 'package:feasta/features/customer/customer_cancellation_dialog.dart';
import 'package:feasta/shared/models/booking_refund_policy.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _EmptyAttemptStore implements CancellationAttemptStore {
  @override
  Future<CancellationAttempt?> read({
    required String uid,
    required String providerRequestId,
  }) async => null;

  @override
  Future<void> save(CancellationAttempt attempt) async {}
}

void main() {
  test('BookingRefundPolicy parses optional cancellationCutoff disclosure', () {
    final policy = BookingRefundPolicy.fromJson({
      'providerId': 'prov_1',
      'providerName': 'Emerald Catering',
      'effectivePolicyKey': 'provider_default:prov_1:v1',
      'sourceKind': 'provider_default',
      'policyVersion': 1,
      'rules': const [
        {'stage': 'preparation_not_started', 'refundBasisPoints': 10000},
        {'stage': 'preparation_started', 'refundBasisPoints': 5000},
        {'stage': 'service_started', 'refundBasisPoints': 0},
      ],
      'terms': 'Cancel early.',
      'cancellationCutoff': const {
        'sourceKind': 'provider_custom',
        'cutoffHoursBeforeEvent': 36,
        'guidanceNote': '36-hour notice required.',
      },
    });

    expect(policy.cancellationCutoff, isNotNull);
    expect(policy.cancellationCutoff!.sourceKind, 'provider_custom');
    expect(policy.cancellationCutoff!.cutoffHoursBeforeEvent, 36);
    expect(policy.cancellationCutoff!.guidanceNote, '36-hour notice required.');
    expect(formatCancellationCutoffDuration(36), '1 day 12 hours');
    expect(formatCancellationCutoffDuration(72), '3 days');
  });

  test('CustomerCancellationClient recognizes CANCELLATION_CUTOFF_PASSED', () {
    expect(
      CustomerCancellationClient.reasonCodes.contains(
        'CANCELLATION_CUTOFF_PASSED',
      ),
      isTrue,
    );
  });

  testWidgets(
    'CustomerCancellationDialog displays cutoff-passed closure without submit button',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CustomerCancellationDialog(
              providerRequestId: 'req_cutoff_1234',
              providerName: 'Emerald Catering',
              serviceName: 'Fiesta Package',
              attemptStore: _EmptyAttemptStore(),
              currentCustomerUid: () => 'cust_1',
              loadOptions: (_) async => {
                'providerRequestId': 'req_cutoff_1234',
                'providerRequestStatus': 'confirmed',
                'cancellationAllowed': false,
                'reasonCode': 'CANCELLATION_CUTOFF_PASSED',
                'cancellationCutoffAt': '2026-12-07T06:00:00.000Z',
                'cancellationCutoffHours': 72,
                'eligibilityExpiresInMs': 0,
                'activeCancellation': null,
                'policy': null,
                'refundPreview': null,
              },
              loadStatus: (_) async => {
                'providerRequestId': 'req_cutoff_1234',
                'cancellation': null,
              },
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Cancellation closed — cutoff passed'), findsOneWidget);
      expect(find.textContaining('Report an Issue remains available'), findsOneWidget);
      expect(find.text('Submit cancellation request'), findsNothing);
    },
  );

  testWidgets(
    'BookingRefundPolicyTerms renders unified Before/After Cancellation Cutoff rules',
    (tester) async {
      final policy = BookingRefundPolicy.fromJson({
        'providerId': 'prov_1',
        'providerName': 'Emerald Catering',
        'effectivePolicyKey': 'provider_default:prov_1:v2',
        'sourceKind': 'provider_default',
        'policyVersion': 2,
        'rules': const [
          {'stage': 'preparation_not_started', 'refundBasisPoints': 8000},
          {'stage': 'preparation_started', 'refundBasisPoints': 0},
          {'stage': 'service_started', 'refundBasisPoints': 0},
        ],
        'terms': 'Cancel before cutoff.',
        'cancellationCutoff': const {
          'sourceKind': 'provider_custom',
          'cutoffHoursBeforeEvent': 72,
          'guidanceNote': null,
        },
      });

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: BookingRefundPolicyTerms(
                policy: policy,
                acknowledged: false,
                onChanged: (_) {},
              ),
            ),
          ),
        ),
      );

      expect(find.text('Provider refund policy'), findsOneWidget);
      expect(
        find.text('Before cancellation cutoff: 80% refund'),
        findsOneWidget,
      );
      expect(
        find.text('After cancellation cutoff: 0% refund (Cancellation closed)'),
        findsOneWidget,
      );
      expect(find.textContaining('After preparation starts'), findsNothing);
    },
  );

  testWidgets(
    'CustomerCancellationDialog displays unified cutoff rules for cutoff-backed bookings',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CustomerCancellationDialog(
              providerRequestId: 'req_cutoff_unified',
              providerName: 'Emerald Catering',
              serviceName: 'Fiesta Package',
              attemptStore: _EmptyAttemptStore(),
              currentCustomerUid: () => 'cust_1',
              loadOptions: (_) async => {
                'providerRequestId': 'req_cutoff_unified',
                'providerRequestStatus': 'confirmed',
                'cancellationAllowed': true,
                'reasonCode': 'ALLOWED',
                'cancellationCutoffAt': '2026-12-07T06:00:00.000Z',
                'cancellationCutoffHours': 72,
                'eligibilityExpiresInMs': null,
                'activeCancellation': null,
                'policy': {
                  'rules': const [
                    {
                      'stage': 'preparation_not_started',
                      'refundBasisPoints': 8000,
                    },
                    {'stage': 'preparation_started', 'refundBasisPoints': 0},
                    {'stage': 'service_started', 'refundBasisPoints': 0},
                  ],
                  'terms': 'Unified policy terms.',
                },
                'refundPreview': {
                  'frozenStage': 'preparation_not_started',
                  'refundAmountInCentavos': 80000,
                },
              },
              loadStatus: (_) async => {
                'providerRequestId': 'req_cutoff_unified',
                'cancellation': null,
              },
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(
        find.text('Before cancellation cutoff: 80% refundable'),
        findsOneWidget,
      );
      expect(
        find.text(
          'After cancellation cutoff: 0% refundable (Cancellation closed)',
        ),
        findsOneWidget,
      );
      expect(
        find.text('Eligible window: Before cancellation cutoff'),
        findsOneWidget,
      );
      expect(find.textContaining('Preparation Started'), findsNothing);
    },
  );
}
