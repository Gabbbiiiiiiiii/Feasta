import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'booking_attempt_test.dart' show MemoryStore, selection;

void main() {
  late MemoryStore store;
  late BookingAttemptCoordinator coordinator;
  String? uid;
  late BookingAttempt pending;
  setUp(() async {
    uid = 'customer_123';
    store = MemoryStore();
    coordinator = BookingAttemptCoordinator(
      store: store,
      currentUid: () => uid,
    );
    final a = await coordinator.prepare(selection());
    final data = jsonDecode(store.values[uid]!) as Map<String, dynamic>;
    data['status'] = 'dispatchPending';
    store.values[uid!] = jsonEncode(data);
    pending = (await coordinator.restore())!;
    expect(pending.clientRequestId, a.clientRequestId);
  });
  Future<Map<String, dynamic>> rejected(String id, String owner) async => {
    'clientRequestId': id,
    'outcome': 'confirmed_rejected',
  };
  test(
    'authoritative rejection retains identity across restart and permits explicit fresh preparation',
    () async {
      final result = await coordinator.reconcile(
        pending.clientRequestId,
        rejected,
      );
      expect(result.status, BookingAttemptStatus.rejectedBeforeCreation);
      expect(result.clientRequestId, pending.clientRequestId);
      expect(result.selectionIdentity, pending.selectionIdentity);
      final restarted = BookingAttemptCoordinator(
        store: store,
        currentUid: () => uid,
      );
      expect(
        (await restarted.restore())!.status,
        BookingAttemptStatus.rejectedBeforeCreation,
      );
      final next = await restarted.prepare(selection());
      expect(next.clientRequestId, isNot(pending.clientRequestId));
      expect(next.status, BookingAttemptStatus.blockedFreshDisclosures);
      await expectLater(restarted.beginDispatch(selection()), throwsStateError);
    },
  );
  test(
    'unresolved historical request retains lock and original selection after form changes',
    () async {
      final result = await coordinator.reconcile(pending.clientRequestId, (
        id,
        owner,
      ) async {
        expect(id, pending.clientRequestId);
        expect(owner, pending.uid);
        return {'clientRequestId': id, 'outcome': 'unresolved'};
      });
      expect(result.selectionIdentity, pending.selectionIdentity);
      await expectLater(
        coordinator.prepare(selection(address: 'Changed')),
        throwsStateError,
      );
      await expectLater(
        coordinator.close(pending.clientRequestId),
        throwsStateError,
      );
      expect(
        (await coordinator.restore())!.clientRequestId,
        pending.clientRequestId,
      );
    },
  );
  for (final response in [
    {'outcome': 'confirmed_rejected', 'clientRequestId': 'other'},
    {'outcome': 'made_up'},
    {'outcome': 'confirmed_created', 'booking': <String, dynamic>{}},
  ]) {
    test(
      'malformed or mismatched response remains locked: $response',
      () async {
        final result = await coordinator.reconcile(
          pending.clientRequestId,
          (id, owner) async => {'clientRequestId': id, ...response},
        );
        expect(result.status, BookingAttemptStatus.requiresReconciliation);
        await expectLater(
          coordinator.prepare(selection(address: 'Changed')),
          throwsStateError,
        );
      },
    );
  }
  test(
    'created response restores canonical booking without another submission',
    () async {
      final result = await coordinator.reconcile(
        pending.clientRequestId,
        (id, owner) async => {
          'clientRequestId': id,
          'outcome': 'confirmed_created',
          'booking': {
            'bookingId': 'booking_123',
            'mainEventId': 'booking_123',
            'providerRequestIds': ['request_123'],
            'created': false,
          },
        },
      );
      expect(result.status, BookingAttemptStatus.confirmedExisting);
      expect(result.result!.bookingId, 'booking_123');
      await expectLater(
        coordinator.beginDispatch(selection()),
        throwsStateError,
      );
    },
  );
  test('network interruption leaves original request locked', () async {
    await expectLater(
      coordinator.reconcile(
        pending.clientRequestId,
        (_, _) => Future.error(TimeoutException('lost response')),
      ),
      throwsA(isA<TimeoutException>()),
    );
    expect(
      (await coordinator.restore())!.clientRequestId,
      pending.clientRequestId,
    );
    await expectLater(coordinator.beginDispatch(selection()), throwsStateError);
  });
  test('account switch and logout epoch discard in-flight rejection', () async {
    final response = Completer<Map<String, dynamic>>();
    final entered = Completer<void>();
    final operation = coordinator.reconcile(pending.clientRequestId, (
      id,
      owner,
    ) {
      entered.complete();
      return response.future;
    });
    await entered.future;
    uid = 'customer_other';
    coordinator.invalidateSession();
    uid = pending.uid;
    response.complete(await rejected(pending.clientRequestId, pending.uid));
    await expectLater(operation, throwsStateError);
    expect(
      (await coordinator.restore())!.status,
      BookingAttemptStatus.requiresReconciliation,
    );
    expect(store.values.keys, [pending.uid]);
  });
  test(
    'duplicate recovery taps serialize and never bypass readiness',
    () async {
      final results = await Future.wait([
        coordinator.reconcile(pending.clientRequestId, rejected),
        coordinator.reconcile(pending.clientRequestId, rejected),
      ]);
      expect(
        results.every(
          (r) => r.status == BookingAttemptStatus.rejectedBeforeCreation,
        ),
        isTrue,
      );
      await expectLater(
        coordinator.beginDispatch(selection()),
        throwsStateError,
      );
    },
  );
}
