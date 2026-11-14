import 'dart:async';
import 'dart:convert';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'customer_event_list_test.dart'
    show MemoryEventStorage, EventAuth, record;

class StartupStorage extends MemoryEventStorage {
  int reads = 0, failures = 0;
  @override
  Future<String?> read(String key) {
    reads++;
    if (failures > 0) {
      failures--;
      return Future.error(StateError('secure storage unavailable'));
    }
    return super.read(key);
  }
}

void main() {
  testWidgets('startup restoration scenarios', (tester) async {
    for (final scenario in [
      'cold',
      'delayed',
      'retry',
      'failure',
      'empty',
      'switch',
      'logout',
    ]) {
      final memory = StartupStorage();
      final auth = EventAuth();
      final store = EventListStore(storage: memory);
      memory.values[store.key(auth.uid!)] = jsonEncode(record());

      final controller = EventListController(
        store: store,
        authentication: auth,
      );
      addTearDown(() {
        controller.dispose();
        auth.dispose();
      });
      memory.reads = 0;
      if (scenario == 'cold') auth.switchTo(null);
      if (scenario == 'empty') auth.switchTo('customer_B');
      if (scenario == 'retry') memory.failures = 1;
      if (scenario == 'failure') memory.failures = 2;
      if (['delayed', 'switch', 'logout'].contains(scenario)) {
        memory.readGate = Completer<void>();
      }
      await tester.pumpWidget(
        EventListScope(
          controller: controller,
          child: MaterialApp(
            home: AnimatedBuilder(
              animation: controller,
              builder: (_, _) =>
                  Text('badge:${controller.list?.entries.length ?? 0}'),
            ),
          ),
        ),
      );
      await tester.pump();
      if (scenario == 'cold') {
        expect(memory.reads, 0);
        expect(
          controller.restorationState,
          EventListRestorationState.unauthorized,
        );
        auth.switchTo('customer_A');
      }
      if (memory.readGate != null) {
        expect(controller.restorationState, EventListRestorationState.loading);
        expect(controller.list, isNull);
        if (scenario == 'switch') auth.switchTo('customer_B');
        if (scenario == 'logout') auth.switchTo(null);
        memory.readGate!.complete();
      }
      await tester.pumpAndSettle();
      if (scenario == 'failure') {
        expect(controller.restorationState, EventListRestorationState.failed);
        auth.emit();
        await tester.pumpAndSettle();
        expect(memory.reads, 2);
        final reload = controller.load();
        await tester.pumpAndSettle();
        expect(await reload, EventListResult.loaded);
        await tester.pump();
      }
      if (scenario == 'retry') expect(memory.reads, 2);
      final absent = ['empty', 'switch', 'logout'].contains(scenario);
      expect(find.text('badge:${absent ? 0 : 1}'), findsOneWidget);
      expect(controller.error, isNull);
      if (scenario == 'empty') {
        expect(memory.reads, 1);
        expect(controller.restorationState, EventListRestorationState.empty);
      }
      if (scenario == 'switch') expect(controller.list!.ownerUid, 'customer_B');
      if (scenario == 'logout') expect(controller.list, isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    }
  });
}
