import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'booking_attempt_test.dart' show MemoryStore, selection;

void main() {
  for (final outcome in [
    'confirmed_created',
    'confirmed_rejected',
    'unresolved',
    'invalid',
    'error',
    'account',
  ]) {
    test('booking recovery: $outcome', () async {
      final store = MemoryStore();
      String? uid = 'customer_123';
      final c = BookingAttemptCoordinator(store: store, currentUid: () => uid);
      final original = await c.prepare(selection());
      final id = original.clientRequestId;
      final saved = jsonDecode(store.values[uid]!) as Map<String, dynamic>;
      saved['status'] = 'dispatchPending';
      store.values[uid] = jsonEncode(saved);
      final entered = Completer<void>();
      final release = Completer<void>();
      final recovery = c.reconcile(id, (_, _) async {
        entered.complete();
        await release.future;
        if (outcome == 'error') throw StateError('offline');
        return {
          'clientRequestId': id,
          'outcome': outcome == 'invalid' ? 'confirmed_created' : outcome,
          'booking': outcome == 'invalid'
              ? {}
              : {
                  'bookingId': 'booking_123',
                  'mainEventId': 'booking_123',
                  'providerRequestIds': ['request_123'],
                  'created': false,
                },
        };
      });
      await entered.future;
      if (outcome == 'account') uid = 'other_customer';
      release.complete();
      if (outcome == 'account' || outcome == 'error') {
        await expectLater(recovery, throwsStateError);
      } else {
        final reconciled = await recovery;
        if (outcome == 'confirmed_created') {
          expect(reconciled.status, BookingAttemptStatus.confirmedExisting);
          expect((await c.prepare(selection())).clientRequestId, id);
          final closed = await c.close(id);
          expect(closed.status, BookingAttemptStatus.completed);
          expect(closed.result!.bookingId, 'booking_123');
        }
      }
      if (outcome == 'confirmed_created' || outcome == 'confirmed_rejected') {
        final fresh = await c.prepare(selection());
        expect(fresh.clientRequestId, isNot(id));
        expect(fresh.result, isNull);
        expect(fresh.status, BookingAttemptStatus.blockedFreshDisclosures);
        await expectLater(c.beginDispatch(selection()), throwsStateError);
      } else {
        await expectLater(c.close(id), throwsStateError);
        if (outcome == 'account') {
          expect(
            jsonDecode(store.values['customer_123']!)['status'],
            'dispatchPending',
          );
          expect(store.values.containsKey('other_customer'), isFalse);
        } else {
          expect((await c.prepare(selection())).clientRequestId, id);
        }
      }
    });
  }
}
