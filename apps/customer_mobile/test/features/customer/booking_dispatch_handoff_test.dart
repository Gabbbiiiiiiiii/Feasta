import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'booking_attempt_test.dart'
    show MemoryStore, DispatchGateStore, selection;

void main() {
  for (final lifecycle in ['covered', 'disposed']) {
    testWidgets('persisted dispatch reaches sender when review is $lifecycle', (
      tester,
    ) async {
      final initial = MemoryStore();
      final seed = BookingAttemptCoordinator(
        store: initial,
        currentUid: () => 'customer_123',
      );
      final prepared = await seed.prepare(selection());
      final raw =
          jsonDecode(initial.values['customer_123']!) as Map<String, dynamic>;
      raw['status'] = 'ready';
      final store = DispatchGateStore()
        ..values['customer_123'] = jsonEncode(raw);
      final coordinator = BookingAttemptCoordinator(
        store: store,
        currentUid: () => 'customer_123',
      );
      final navigator = GlobalKey<NavigatorState>();
      var sends = 0;
      Future<void>? submission;
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: navigator,
          home: Scaffold(
            body: TextButton(
              onPressed: () {
                submission = coordinator.dispatch(selection(), (attempt) async {
                  expect(
                    jsonDecode(store.values['customer_123']!)['status'],
                    'dispatchPending',
                  );
                  expect(attempt.clientRequestId, prepared.clientRequestId);
                  sends++;
                });
              },
              child: const Text('Submit'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Submit'));
      await tester.pump();
      await store.entered.future;
      expect(sends, 0);
      if (lifecycle == 'covered') {
        navigator.currentState!.push(
          MaterialPageRoute<void>(
            builder: (_) => const Scaffold(body: Text('Other route')),
          ),
        );
        await tester.pumpAndSettle();
      } else {
        await tester.pumpWidget(const SizedBox());
      }
      store.release.complete();
      await submission;
      await tester.pumpAndSettle();
      expect(sends, 1);
      expect(tester.takeException(), isNull);
      await expectLater(
        coordinator.dispatch(selection(), (_) async {
          sends++;
        }),
        throwsStateError,
      );
      expect(sends, 1);
    });
  }
}
