import 'dart:convert';
import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'package:feasta/shared/models/booking_contract.dart';
import 'package:feasta/shared/models/event_customization_data.dart';

class MemoryStore implements BookingAttemptStore {
  final values = <String, String>{};
  bool fail = false;
  @override
  Future<String?> read(String uid) async => values[uid];
  @override
  Future<void> write(String uid, String value) async {
    if (fail) throw StateError('storage unavailable');
    values[uid] = value;
  }
}

class DelayedStore extends MemoryStore {
  final entered = Completer<void>();
  final release = Completer<void>();
  @override
  Future<void> write(String uid, String value) async {
    entered.complete();
    await release.future;
    await super.write(uid, value);
  }
}

BookingSelection selection({
  String address = 'Street',
  List<String>? foods,
  List<Map<String, dynamic>>? addons,
}) => BookingSelection(
  providerId: 'provider_123',
  packageId: 'package_123',
  customization: EventCustomizationData(
    eventType: 'birthday',
    eventDate: DateTime(2030, 1, 2),
    eventTime: '14:00',
    eventEndTime: '18:00',
    guestCount: 50,
    eventLocation: 'Ormoc',
    eventAddress: address,
    selectedFoods: foods ?? ['Rice'],
    selectedDecorations: [],
    selectedFurniture: [],
    selectedAddOns: addons ?? [],
    willArrangeOwnAddOns: false,
    customerArrangedAddOnsNote: '',
    specialRequest: '',
  ),
);
void main() {
  late MemoryStore store;
  late BookingAttemptCoordinator c;
  String? uid;
  setUp(() {
    store = MemoryStore();
    uid = 'customer_123';
    c = BookingAttemptCoordinator(store: store, currentUid: () => uid);
  });
  Future<void> seedPending() async {
    await c.prepare(selection());
    final d = jsonDecode(store.values[uid]!) as Map<String, dynamic>;
    d['status'] = 'dispatchPending';
    store.values[uid!] = jsonEncode(d);
  }

  final response = {
    'bookingId': 'booking_123',
    'mainEventId': 'booking_123',
    'providerRequestIds': ['request_123'],
    'created': true,
  };
  test(
    'dispatch persists pending and interrupted restoration blocks another dispatch',
    () async {
      final a = await c.prepare(selection());
      final saved = jsonDecode(store.values[uid]!) as Map<String, dynamic>;
      saved['status'] = 'ready';
      store.values[uid!] = jsonEncode(saved);
      final pending = await c.beginDispatch(selection());
      expect(pending.clientRequestId, a.clientRequestId);
      expect(pending.status, BookingAttemptStatus.dispatchPending);
      final restored = BookingAttemptCoordinator(
        store: store,
        currentUid: () => uid,
      );
      expect(
        (await restored.prepare(selection())).status,
        BookingAttemptStatus.requiresReconciliation,
      );
      await expectLater(restored.beginDispatch(selection()), throwsStateError);
    },
  );
  test(
    'regression: old post-persistence route guard strands an unsent request',
    () async {
      final prepared = await c.prepare(selection());
      final raw = jsonDecode(store.values[uid]!) as Map<String, dynamic>;
      raw['status'] = 'ready';
      store.values[uid!] = jsonEncode(raw);
      final delayed = DispatchGateStore()..values.addAll(store.values);
      final coordinator = BookingAttemptCoordinator(
        store: delayed,
        currentUid: () => uid,
      );
      var canAct = true;
      var sends = 0;
      Future<void> oldHandoff() async {
        await coordinator.beginDispatch(selection());
        if (!canAct) return;
        sends++;
      }

      final operation = oldHandoff();
      await delayed.entered.future;
      canAct = false;
      delayed.release.complete();
      await operation;
      expect(sends, 0);
      expect(jsonDecode(delayed.values[uid]!)['status'], 'dispatchPending');
      final restored = (await coordinator.restore())!;
      expect(restored.clientRequestId, prepared.clientRequestId);
      expect(restored.status, BookingAttemptStatus.requiresReconciliation);
      expect(restored.safeToSupersede, isFalse);
    },
  );

  for (final interruption in [
    'none',
    'account',
    'session',
    'write',
    'transport',
  ]) {
    test('dispatch handoff retains safety: $interruption', () async {
      final prepared = await c.prepare(selection());
      final raw = jsonDecode(store.values[uid]!) as Map<String, dynamic>;
      raw['status'] = 'ready';
      store.values[uid!] = jsonEncode(raw);
      final delayed = DispatchGateStore()..values.addAll(store.values);
      final coordinator = BookingAttemptCoordinator(
        store: delayed,
        currentUid: () => uid,
      );
      var sends = 0;
      final operation = coordinator.dispatch(selection(), (attempt) async {
        sends++;
        expect(
          jsonDecode(delayed.values[attempt.uid]!)['status'],
          'dispatchPending',
        );
        expect(attempt.clientRequestId, prepared.clientRequestId);
        if (interruption == 'transport') {
          throw StateError('transport may have started');
        }
        return 'sent';
      });
      final expectation = interruption == 'none'
          ? expectLater(operation, completion('sent'))
          : expectLater(operation, throwsStateError);
      await delayed.entered.future;
      expect(sends, 0);
      if (interruption == 'account') uid = 'customer_456';
      if (interruption == 'session') coordinator.invalidateSession();
      if (interruption == 'write') delayed.fail = true;
      delayed.release.complete();
      await expectation;
      expect(sends, ['none', 'transport'].contains(interruption) ? 1 : 0);
      uid = 'customer_123';
      delayed.fail = false;
      final restarted = BookingAttemptCoordinator(
        store: delayed,
        currentUid: () => uid,
      );
      final restored = (await restarted.restore())!;
      expect(restored.clientRequestId, prepared.clientRequestId);
      if (interruption != 'write') {
        expect(restored.safeToSupersede, isFalse);
        await expectLater(
          restarted.dispatch(selection(), (_) async {
            sends++;
          }),
          throwsStateError,
        );
        await expectLater(
          restarted.prepare(selection(address: 'Changed')),
          throwsStateError,
        );
      }
    });
  }

  test('account switch prevents dispatch of prepared selection', () async {
    await c.prepare(selection());
    uid = 'other_customer';
    await expectLater(c.beginDispatch(selection()), throwsStateError);
  });
  test('stable repeated preparation', () async {
    final a = await c.prepare(selection());
    expect((await c.prepare(selection())).clientRequestId, a.clientRequestId);
    expect(store.values[uid], contains(a.clientRequestId));
  });
  test(
    'persistence completes before fake dispatch can observe an attempt',
    () async {
      final delayed = DelayedStore();
      final coordinator = BookingAttemptCoordinator(
        store: delayed,
        currentUid: () => uid,
      );
      bool fakeDispatched = false;
      final operation = coordinator.prepare(selection()).then((a) {
        expect(delayed.values[uid], contains(a.clientRequestId));
        fakeDispatched = true;
      });
      await delayed.entered.future;
      expect(fakeDispatched, isFalse);
      delayed.release.complete();
      await operation;
      expect(fakeDispatched, isTrue);
    },
  );
  test('snapshot freezes before queued persistence begins', () async {
    final foods = ['Rice'];
    final pending = c.prepare(selection(foods: foods));
    foods.add('Fish');
    expect((await pending).selection['selectedFoods'], ['Rice']);
  });
  test('in-flight account changes cannot expose the old attempt', () async {
    final delayed = DelayedStore();
    final coordinator = BookingAttemptCoordinator(
      store: delayed,
      currentUid: () => uid,
    );
    final operation = coordinator.prepare(selection());
    final expectation = expectLater(operation, throwsStateError);
    await delayed.entered.future;
    uid = 'customer_456';
    coordinator.invalidateSession();
    delayed.release.complete();
    await expectation;
    expect(delayed.values.keys, ['customer_123']);
  });
  test('signout then same-account signin invalidates old work', () async {
    final pending = c.prepare(selection());
    c.invalidateSession();
    await expectLater(pending, throwsStateError);
    expect(store.values, isEmpty);
  });
  test('concurrent preparations serialize to one identity', () async {
    final all = await Future.wait(
      List.generate(10, (_) => c.prepare(selection())),
    );
    expect(all.map((a) => a.clientRequestId).toSet(), hasLength(1));
  });
  test('restart preserves ID and blocks disclosures', () async {
    final a = await c.prepare(selection());
    final restarted = BookingAttemptCoordinator(
      store: store,
      currentUid: () => uid,
    );
    final restored = (await restarted.restore())!;
    expect(restored.clientRequestId, a.clientRequestId);
    expect(restored.status, BookingAttemptStatus.blockedFreshDisclosures);
    expect(restored.toJson().keys, isNot(contains('acknowledgements')));
  });
  test('selection snapshot detached from source and accessor', () async {
    final foods = ['Rice'];
    final a = await c.prepare(selection(foods: foods));
    foods.add('Fish');
    (a.selection['selectedFoods'] as List).clear();
    expect(a.selection['selectedFoods'], ['Rice']);
  });
  test('changed safe selection gets distinct identity', () async {
    final a = await c.prepare(selection());
    final b = await c.prepare(selection(address: 'Other street'));
    expect(b.clientRequestId, isNot(a.clientRequestId));
  });
  test('addon order normalized', () {
    expect(
      bookingSelectionIdentity(
        selection(
          addons: [
            {'addonId': 'addon_123'},
            {'addonId': 'addon_456'},
          ],
        ),
      ),
      bookingSelectionIdentity(
        selection(
          addons: [
            {'addonId': 'addon_456'},
            {'addonId': 'addon_123'},
          ],
        ),
      ),
    );
  });
  test('timeout keeps ID, requires reconciliation', () async {
    await seedPending();
    final a = (await c.restore())!;
    final b = await c.recordInterruption(
      a.clientRequestId,
      BookingAttemptInterruption.timeout,
    );
    expect(b.clientRequestId, a.clientRequestId);
    expect(b.status, BookingAttemptStatus.outcomeUncertain);
  });
  test('uncertain selection cannot be replaced', () async {
    await seedPending();
    await expectLater(
      c.prepare(selection(address: 'Changed')),
      throwsStateError,
    );
    expect(
      (await c.restore())!.status,
      BookingAttemptStatus.requiresReconciliation,
    );
  });
  test('corrupt storage retained and blocks new identity', () async {
    store.values[uid!] = '{bad';
    await expectLater(c.prepare(selection()), throwsFormatException);
    expect(store.values[uid], '{bad');
  });
  test('corrupt snapshot fails validation', () async {
    await c.prepare(selection());
    final d = jsonDecode(store.values[uid]!);
    d['selectionIdentity'] = '{}';
    store.values[uid!] = jsonEncode(d);
    await expectLater(c.restore(), throwsA(anything));
  });
  test('write failure cannot yield prepared attempt', () async {
    store.fail = true;
    await expectLater(c.prepare(selection()), throwsStateError);
  });
  test('accounts isolated; signout blocks', () async {
    final a = await c.prepare(selection());
    uid = 'customer_456';
    expect(await c.restore(), isNull);
    final b = await c.prepare(selection());
    expect(a.clientRequestId, isNot(b.clientRequestId));
    uid = null;
    await expectLater(c.restore(), throwsStateError);
    uid = 'customer_123';
    expect((await c.restore())!.clientRequestId, a.clientRequestId);
  });
  test('ownership corruption fails closed', () async {
    await c.prepare(selection());
    final d = jsonDecode(store.values[uid]!);
    d['uid'] = 'customer_456';
    store.values[uid!] = jsonEncode(d);
    await expectLater(c.restore(), throwsFormatException);
  });
  for (final created in [true, false]) {
    test('strict known response created=$created', () async {
      await seedPending();
      final a = (await c.restore())!;
      final b = await c.recordResponse(a.clientRequestId, {
        ...response,
        'created': created,
      });
      expect(
        b.status,
        created
            ? BookingAttemptStatus.confirmedCreated
            : BookingAttemptStatus.confirmedExisting,
      );
      expect(b.result!.providerRequestIds, ['request_123']);
      final repeat = await c.recordResponse(a.clientRequestId, {
        ...response,
        'created': false,
      });
      expect(repeat.clientRequestId, a.clientRequestId);
    });
  }
  test('malformed response is uncertain', () async {
    await seedPending();
    final a = (await c.restore())!;
    expect(
      (await c.recordResponse(a.clientRequestId, {})).status,
      BookingAttemptStatus.requiresReconciliation,
    );
  });
  test('fingerprint conflict retains identity', () async {
    await seedPending();
    final a = (await c.restore())!;
    await c.recordInterruption(
      a.clientRequestId,
      BookingAttemptInterruption.fingerprintConflict,
    );
    expect((await c.prepare(selection())).clientRequestId, a.clientRequestId);
  });
  test('read failure and absence never establish rejection', () async {
    await seedPending();
    final a = (await c.restore())!;
    expect(
      (await c.requireReconciliation(a.clientRequestId)).status,
      BookingAttemptStatus.requiresReconciliation,
    );
  });
  test('undispatched draft cannot accept server response', () async {
    final a = await c.prepare(selection());
    await expectLater(
      c.recordResponse(a.clientRequestId, response),
      throwsStateError,
    );
  });
  test('mismatched request response is blocked', () async {
    await seedPending();
    await expectLater(
      c.recordResponse('other_request', response),
      throwsStateError,
    );
  });
}

class DispatchGateStore extends MemoryStore {
  final entered = Completer<void>();
  final release = Completer<void>();
  @override
  Future<void> write(String uid, String value) async {
    if (jsonDecode(value)['status'] == 'dispatchPending' &&
        !entered.isCompleted) {
      entered.complete();
      await release.future;
    }
    await super.write(uid, value);
  }
}
