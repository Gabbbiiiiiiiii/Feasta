import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'package:feasta/features/customer/booking_agreement_controller.dart';
import 'package:feasta/features/customer/booking_refund_policy_controller.dart';
import 'package:feasta/shared/models/booking_agreement.dart';
import 'package:feasta/shared/models/booking_refund_policy.dart';
import 'booking_attempt_test.dart' show MemoryStore, selection;
import 'booking_agreement_fixtures.dart' show agreementFixture;
import 'booking_refund_policy_test.dart' show refundResponse, refundFixture;

void main() {
  late BookingAttemptCoordinator c;
  late BookingAgreementController agreements;
  late BookingRefundPolicyController refunds;
  String agreementKey = 'a';
  int refundVersion = 1;
  String mode = 'required';
  setUp(() {
    agreementKey = 'a';
    refundVersion = 1;
    mode = 'required';
    c = BookingAttemptCoordinator(
      store: MemoryStore(),
      currentUid: () => 'customer_123',
    );
    agreements = BookingAgreementController(
      loader: (_) async => [
        BookingAgreement.fromJson(agreementFixture(keyCharacter: agreementKey)),
      ],
      now: () => DateTime.utc(2029),
      resolveProviders: (_) async => {'provider_123'},
    );
    refunds = BookingRefundPolicyController(
      loader: (_) async => RefundDisclosures.fromJson(
        refundResponse(
          mode: mode,
          policies: [refundFixture(version: refundVersion)],
        ),
      ),
      resolveProviders: (_) async => {'provider_123'},
    );
  });
  tearDown(() {
    agreements.dispose();
    refunds.dispose();
  });
  Future<void> review({String owner = 'customer_123'}) async {
    agreements.select(selection(), ownerId: owner);
    refunds.select(selection(), ownerId: owner);
    await agreements.load();
    await refunds.load();
    agreements.acknowledge(
      'provider_123',
      agreements.agreements.single.agreementKey,
      true,
    );
    refunds.acknowledge(
      'provider_123',
      refunds.disclosures!.policies.single.effectivePolicyKey,
      true,
    );
  }

  Future<BookingAttempt> ready(
    String id, {
    AgreementProviderResolver? resolver,
  }) => c.reviewReadiness(
    requestId: id,
    selection: selection(),
    agreements: agreements,
    refunds: refunds,
    resolveProviders: resolver ?? (_) async => {'provider_123'},
  );
  test(
    'current separate disclosures establish preparation readiness only',
    () async {
      final a = await c.prepare(selection());
      await review();
      expect(
        (await ready(a.clientRequestId)).status,
        BookingAttemptStatus.ready,
      );
      expect(
        (await c.restore())!.status,
        BookingAttemptStatus.blockedFreshDisclosures,
      );
      expect(
        (await ready(a.clientRequestId)).status,
        BookingAttemptStatus.blockedFreshDisclosures,
      );
    },
  );
  test('rollout off remains blocked even with acknowledgments', () async {
    mode = 'off';
    final a = await c.prepare(selection());
    await review();
    expect(
      (await ready(a.clientRequestId)).status,
      BookingAttemptStatus.blockedFreshDisclosures,
    );
  });
  test(
    'fresh validation preserves only explicitly accepted current keys',
    () async {
      final a = await c.prepare(selection());
      await review();
      await agreements.load(revalidate: true);
      await refunds.load(revalidate: true);
      expect(
        (await ready(a.clientRequestId)).status,
        BookingAttemptStatus.ready,
      );
      final dispatched = await c.beginDispatch(selection());
      expect(dispatched.clientRequestId, a.clientRequestId);
      await expectLater(c.beginDispatch(selection()), throwsStateError);
    },
  );
  test('changed fresh agreement invalidates acceptance', () async {
    await c.prepare(selection());
    await review();
    agreementKey = 'b';
    await agreements.load(revalidate: true);
    expect(agreements.allAcknowledged, isFalse);
  });
  test('changed fresh refund invalidates acceptance', () async {
    await c.prepare(selection());
    await review();
    refundVersion = 2;
    await refunds.load(revalidate: true);
    expect(refunds.allAcknowledged, isFalse);
  });
  test('missing payment acceptance prevents dispatch', () async {
    final a = await c.prepare(selection());
    await review();
    agreements.acknowledge(
      'provider_123',
      agreements.agreements.single.agreementKey,
      false,
    );
    expect(
      (await ready(a.clientRequestId)).status,
      BookingAttemptStatus.blockedFreshDisclosures,
    );
    await expectLater(c.beginDispatch(selection()), throwsStateError);
  });
  test('missing refund acceptance prevents dispatch', () async {
    final a = await c.prepare(selection());
    await review();
    refunds.acknowledge(
      'provider_123',
      refunds.disclosures!.policies.single.effectivePolicyKey,
      false,
    );
    expect(
      (await ready(a.clientRequestId)).status,
      BookingAttemptStatus.blockedFreshDisclosures,
    );
    await expectLater(c.beginDispatch(selection()), throwsStateError);
  });
  test('revalidation never fabricates acceptance', () async {
    agreements.select(selection(), ownerId: 'customer_123');
    refunds.select(selection(), ownerId: 'customer_123');
    await agreements.load(revalidate: true);
    await refunds.load(revalidate: true);
    expect(agreements.allAcknowledged, isFalse);
    expect(refunds.allAcknowledged, isFalse);
  });
  test('old agreement keys cannot establish readiness', () async {
    final a = await c.prepare(selection());
    await review();
    agreementKey = 'b';
    await agreements.load();
    agreements.acknowledge('provider_123', 'a' * 64, true);
    expect(
      (await ready(a.clientRequestId)).status,
      BookingAttemptStatus.blockedFreshDisclosures,
    );
  });
  test('old refund keys cannot establish readiness', () async {
    final a = await c.prepare(selection());
    await review();
    refundVersion = 2;
    await refunds.load();
    refunds.acknowledge(
      'provider_123',
      'provider_default:provider_123:v1',
      true,
    );
    expect(
      (await ready(a.clientRequestId)).status,
      BookingAttemptStatus.blockedFreshDisclosures,
    );
  });
  test('different account consent is blocked', () async {
    final a = await c.prepare(selection());
    await review(owner: 'customer_456');
    expect(
      (await ready(a.clientRequestId)).status,
      BookingAttemptStatus.blockedFreshDisclosures,
    );
  });
  test(
    'provider ownership change before dispatch blocks fresh review',
    () async {
      final a = await c.prepare(selection());
      await review();
      expect(
        (await ready(
          a.clientRequestId,
          resolver: (_) async => {'provider_456'},
        )).status,
        BookingAttemptStatus.blockedFreshDisclosures,
      );
      expect(
        (await c.close(a.clientRequestId)).status,
        BookingAttemptStatus.safelyAbandoned,
      );
    },
  );
  test('read failure does not establish absence', () async {
    final a = await c.prepare(selection());
    await review();
    expect(
      (await ready(
        a.clientRequestId,
        resolver: (_) async => throw StateError('network'),
      )).status,
      BookingAttemptStatus.blockedFreshDisclosures,
    );
  });
  test('changed keys during ownership lookup invalidate evidence', () async {
    final a = await c.prepare(selection());
    await review();
    final gate = Completer<Set<String>>();
    final entered = Completer<void>();
    final pending = ready(
      a.clientRequestId,
      resolver: (_) {
        entered.complete();
        return gate.future;
      },
    );
    await entered.future;
    agreementKey = 'b';
    await agreements.load();
    gate.complete({'provider_123'});
    expect(
      (await pending).status,
      BookingAttemptStatus.blockedFreshDisclosures,
    );
  });
  test(
    'explicit safe abandonment allows new intended identical booking',
    () async {
      final a = await c.prepare(selection());
      await c.close(a.clientRequestId);
      expect(
        (await c.prepare(selection())).clientRequestId,
        isNot(a.clientRequestId),
      );
    },
  );
}
