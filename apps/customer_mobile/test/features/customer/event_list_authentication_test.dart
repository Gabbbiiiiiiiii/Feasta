import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'customer_event_list_test.dart'
    show MemoryEventStorage, EventAuth, entry;

void main() {
  late MemoryEventStorage memory;
  late EventAuth auth;
  late EventListController controller;
  setUp(() {
    memory = MemoryEventStorage();
    auth = EventAuth();
    controller = EventListController(
      store: EventListStore(storage: memory),
      authentication: auth,
    );
  });
  tearDown(() {
    controller.dispose();
    auth.dispose();
  });

  test('initial signed-out session restores after sign-in', () async {
    auth.switchTo(null);
    final other = EventListController(
      store: controller.store,
      authentication: auth,
    );
    expect(await other.load(), EventListResult.unauthorized);
    expect(other.list, isNull);
    auth.switchTo('customer_A');
    expect(auth.generation, 2);
    expect(await other.load(), EventListResult.loaded);
    expect(other.list!.ownerUid, 'customer_A');
    other.dispose();
  });

  for (final next in ['customer_B', null]) {
    test('live $next masks all public state before notification', () async {
      await controller.addPackage(entry());
      memory.failRead = true;
      await controller.load();
      expect(controller.error, isNotNull);
      var calls = 0;
      controller.addListener(() => calls++);
      auth.switchTo(next, notify: false);
      expect(auth.generation, 1);
      expect(controller.list, isNull);
      expect(controller.list?.entries.length, isNull);
      expect(controller.error, isNull);
      expect(calls, 0);
      auth.emit();
      expect(calls, 1);
      expect(controller.list, isNull);
      expect(controller.error, isNull);
      auth.emit();
      expect(calls, 1);
      memory.failRead = false;
      auth.switchTo('customer_A');
      expect(await controller.load(), EventListResult.loaded);
      expect(controller.list!.entries.single.packageId, 'package_0');
    });
  }

  test(
    'idle duplicates retain exact cached list and error without listeners',
    () async {
      await controller.addPackage(entry());
      memory.failRead = true;
      await controller.load();
      final prior = controller.list, error = controller.error;
      var calls = 0;
      controller.addListener(() => calls++);
      auth.emit();
      auth.emit();
      expect(auth.generation, 0);
      expect(controller.list, same(prior));
      expect(controller.error, same(error));
      expect(calls, 0);
    },
  );

  for (final stage in ['read', 'write']) {
    for (final transition in [
      'duplicate',
      'AB',
      'ABA',
      'signout',
      'signoutA',
      'newA',
      'dispose',
    ]) {
      test(
        '$transition during pending $stage with delayed notification',
        () async {
          await controller.addPackage(entry());
          final prior = controller.list;
          final gate = Completer<void>(), entered = Completer<void>();
          if (stage == 'read') {
            memory.readGate = gate;
            memory.enteredRead = entered;
          } else {
            memory.writeGate = gate;
            memory.enteredWrite = entered;
          }
          var calls = 0;
          controller.addListener(() => calls++);
          final pending = stage == 'read'
              ? controller.load()
              : controller.addPackage(entry(1));
          await entered.future;
          if (transition == 'duplicate') {
            auth.emit();
            auth.emit();
          } else if (transition == 'newA') {
            auth.switchTo('customer_A', notify: false, newSession: true);
          } else if (transition == 'AB' || transition == 'ABA') {
            auth.switchTo('customer_B', notify: false);
            if (transition == 'ABA') auth.switchTo('customer_A', notify: false);
          } else {
            auth.switchTo(null, notify: false);
            if (transition == 'signoutA') {
              auth.switchTo('customer_A', notify: false);
            }
          }
          expect(
            auth.generation,
            transition == 'duplicate'
                ? 0
                : transition == 'ABA' || transition == 'signoutA'
                ? 2
                : 1,
          );
          expect(calls, 0);
          if (transition == 'duplicate') {
            expect(controller.list, same(prior));
          } else {
            expect(controller.list, isNull);
            expect(controller.list?.entries.map((e) => e.identity), isNull);
            expect(controller.error, isNull);
          }
          if (transition == 'dispose') {
            controller.dispose();
            auth.emit();
            gate.complete();
            expect(await pending, EventListResult.unauthorized);
            expect(controller.list, isNull);
            expect(controller.error, isNull);
            expect(calls, 0);
            controller = EventListController(
              store: controller.store,
              authentication: auth,
            );
            return;
          }
          gate.complete();
          expect(
            await pending,
            transition == 'duplicate'
                ? stage == 'read'
                      ? EventListResult.loaded
                      : EventListResult.saved
                : EventListResult.unauthorized,
          );
          expect(calls, transition == 'duplicate' ? 1 : 0);
          if (transition != 'duplicate') expect(controller.list, isNull);
          auth.emit();
          expect(calls, 1);
          auth.emit();
          expect(calls, 1);
          memory.readGate = null;
          memory.writeGate = null;
          if (auth.uid == null) auth.switchTo('customer_A');
          expect(await controller.load(), EventListResult.loaded);
          expect(controller.list!.ownerUid, auth.uid);
          expect(
            controller.list!.entries.length,
            auth.uid == 'customer_B'
                ? 0
                : stage == 'read'
                ? 1
                : 2,
          );
        },
      );
    }
  }

  test(
    'operation synchronizes live account before delayed notification',
    () async {
      await controller.addPackage(entry());
      auth.switchTo('customer_B', notify: false);
      var calls = 0;
      controller.addListener(() => calls++);
      expect(await controller.load(), EventListResult.loaded);
      expect(controller.list!.ownerUid, 'customer_B');
      expect(controller.list!.entries, isEmpty);
      expect(calls, 2);
      auth.emit();
      expect(calls, 2);
    },
  );
}
