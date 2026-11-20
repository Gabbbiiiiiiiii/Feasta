import 'package:feasta/features/customer/customer_cancellation_attempt_store.dart';
import 'package:feasta/features/customer/customer_cancellation_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const requestId = 'provider_request_123';
const customerId = 'customer_123';

class FakeAttemptStore implements CancellationAttemptStore {
  CancellationAttempt? saved;
  int saves = 0;

  @override
  Future<CancellationAttempt?> read({
    required String uid,
    required String providerRequestId,
  }) async {
    if (uid != customerId || providerRequestId != requestId) {
      throw StateError('Unexpected attempt scope.');
    }
    return saved;
  }

  @override
  Future<void> save(CancellationAttempt attempt) async {
    if (saved != null &&
        (saved!.idempotencyKey != attempt.idempotencyKey ||
            saved!.reason != attempt.reason)) {
      throw StateError('Attempt already exists.');
    }
    saved = attempt;
    saves++;
  }
}

Map<String, dynamic> options({
  bool allowed = true,
  String reasonCode = 'ALLOWED',
  Map<String, dynamic>? active,
  Map<String, dynamic>? policy,
  Map<String, dynamic>? preview,
  int? expiry,
}) => {
  'providerRequestId': requestId,
  'cancellationAllowed': allowed,
  'reasonCode': reasonCode,
  'providerRequestStatus': 'confirmed',
  'activeCancellation': active,
  'policy': policy,
  'refundPreview': preview,
  'eligibilityExpiresInMs': expiry,
};

Map<String, dynamic> status([Map<String, dynamic>? cancellation]) => {
  'providerRequestId': requestId,
  'cancellation': cancellation,
};

Map<String, dynamic> existingCancellation() => {
  'status': 'under_review',
  'decisionStatus': 'pending',
  'refund': {
    'status': 'manual_review',
    'amountInCentavos': null,
    'completedAmountInCentavos': null,
    'currency': null,
  },
};

Map<String, dynamic> policy() => {
  'rules': [
    {'stage': 'preparation_not_started', 'refundBasisPoints': 10000},
    {'stage': 'preparation_started', 'refundBasisPoints': 5000},
    {'stage': 'service_started', 'refundBasisPoints': 0},
  ],
  'terms': 'Refunds are subject to the recorded booking policy.',
};

Map<String, dynamic> preview() => {
  'frozenStage': 'preparation_not_started',
  'refundAmountInCentavos': 7500,
};

Future<void> openDialog(
  WidgetTester tester, {
  required FakeAttemptStore store,
  required Future<Map<String, dynamic>> Function(String) loadOptions,
  Future<Map<String, dynamic>> Function(String)? loadStatus,
  CancellationSubmission? submit,
  String Function()? key,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: CustomerCancellationDialog(
          providerRequestId: requestId,
          providerName: 'Example Provider',
          serviceName: 'Photography',
          attemptStore: store,
          currentCustomerUid: () => customerId,
          loadOptions: loadOptions,
          loadStatus: loadStatus ?? (id) async => status(),
          submitCancellation: submit,
          createAttemptKey: key,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> enterReasonAndAcknowledge(WidgetTester tester) async {
  await tester.enterText(
    find.byType(TextField),
    'Our event schedule has changed.',
  );
  await tester.ensureVisible(find.byType(CheckboxListTile));
  await tester.tap(find.byType(CheckboxListTile));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('denied eligibility does not present a submission form', (
    tester,
  ) async {
    await openDialog(
      tester,
      store: FakeAttemptStore(),
      loadOptions: (_) async =>
          options(allowed: false, reasonCode: 'ROLLOUT_DISABLED'),
    );

    expect(find.text('New cancellation unavailable'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('active cancellation displays status without another form', (
    tester,
  ) async {
    final active = existingCancellation();

    await openDialog(
      tester,
      store: FakeAttemptStore(),
      loadOptions: (_) async => options(
        allowed: false,
        reasonCode: 'ACTIVE_CANCELLATION_EXISTS',
        active: active,
      ),
      loadStatus: (_) async => status(active),
    );

    expect(find.text('Cancellation: Under Review'), findsOneWidget);
    expect(find.text('Refund: Manual Review'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('displays server refund preview without calculating it', (
    tester,
  ) async {
    await openDialog(
      tester,
      store: FakeAttemptStore(),
      loadOptions: (_) async => options(policy: policy(), preview: preview()),
    );

    expect(
      find.textContaining('Estimated refundable amount: PHP 75.00'),
      findsOneWidget,
    );
    expect(find.textContaining('not a completed'), findsOneWidget);
  });

  testWidgets('persists attempt before sending cancellation', (tester) async {
    final store = FakeAttemptStore();
    var calls = 0;
    var savedBeforeSubmission = false;
    String? receivedId;
    String? receivedKey;
    String? receivedReason;

    await openDialog(
      tester,
      store: store,
      loadOptions: (_) async => options(),
      key: () => 'customer-cancellation:1234567890abcdef',
      submit:
          ({
            required providerRequestId,
            required reason,
            required idempotencyKey,
            required acknowledged,
          }) async {
            calls++;
            savedBeforeSubmission = store.saved != null;
            receivedId = providerRequestId;
            receivedKey = idempotencyKey;
            receivedReason = reason;

            expect(acknowledged, isTrue);

            return {
              'providerRequestId': providerRequestId,
              'status': 'submitted',
              'created': true,
              'policyEvidenceStatus': 'policy_backed',
              'manualReviewRequired': false,
            };
          },
    );

    await enterReasonAndAcknowledge(tester);

    await tester.tap(find.text('Submit cancellation request'));
    await tester.pumpAndSettle();

    expect(calls, 1);
    expect(store.saves, 1);
    expect(savedBeforeSubmission, isTrue);
    expect(receivedId, requestId);
    expect(receivedKey, 'customer-cancellation:1234567890abcdef');
    expect(receivedReason, 'Our event schedule has changed.');
    expect(find.text('Cancellation request recorded'), findsOneWidget);
  });

  testWidgets('uncertain submission stays blocked after reopening', (
    tester,
  ) async {
    final store = FakeAttemptStore();
    var calls = 0;

    Future<Map<String, dynamic>> uncertainSubmit({
      required String providerRequestId,
      required String reason,
      required String idempotencyKey,
      required bool acknowledged,
    }) async {
      calls++;
      throw StateError('Simulated lost response');
    }

    await openDialog(
      tester,
      store: store,
      loadOptions: (_) async => options(),
      key: () => 'customer-cancellation:1234567890abcdef',
      submit: uncertainSubmit,
    );

    await enterReasonAndAcknowledge(tester);
    await tester.tap(find.text('Submit cancellation request'));
    await tester.pumpAndSettle();

    expect(calls, 1);
    expect(store.saved, isNotNull);
    expect(find.text('Submission status needs verification'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());

    await openDialog(
      tester,
      store: store,
      loadOptions: (_) async => options(),
      submit: uncertainSubmit,
    );

    expect(find.text('Submission status needs verification'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(calls, 1);
  });

  testWidgets('expired eligibility triggers server refresh', (tester) async {
    var calls = 0;

    await openDialog(
      tester,
      store: FakeAttemptStore(),
      loadOptions: (_) async {
        calls++;
        return options(expiry: calls == 1 ? 1000 : null);
      },
    );

    expect(calls, 1);

    await tester.pump(const Duration(milliseconds: 1100));
    await tester.pumpAndSettle();

    expect(calls, greaterThanOrEqualTo(2));
    expect(find.text('Cancel Example Provider service?'), findsOneWidget);
  });
}
