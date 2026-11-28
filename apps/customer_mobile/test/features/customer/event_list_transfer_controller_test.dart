import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';

import 'customer_event_list_test.dart'
    show EventAuth, MemoryEventStorage, entry;

void allow() {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MemoryEventStorage memory;
  late EventListStore store;
  late EventAuth auth;
  late EventListController controller;

  setUp(() {
    memory = MemoryEventStorage();
    store = EventListStore(storage: memory);
    auth = EventAuth();

    controller = EventListController(
      store: store,
      authentication: auth,
      signedOutGuest: () => false,
    );
  });

  tearDown(() {
    controller.dispose();
    auth.dispose();
  });

  test('authorized customer transfers guest items', () async {
    await store.addPackage('customer_A', entry(), authorize: allow);
    await store.guestAddPackage(entry(), authorize: allow);
    await store.guestAddPackage(entry(1), authorize: allow);

    expect(await controller.transferGuestToCustomer(), EventListResult.saved);

    expect(controller.list!.ownerUid, 'customer_A');
    expect(controller.list!.entries, hasLength(2));

    final guest = await store.guestRead(authorize: allow);
    expect(guest.entries, isEmpty);
  });

  test('missing customer authorization refuses transfer', () async {
    await store.guestAddPackage(entry(), authorize: allow);

    auth.switchTo(null);
    final before = memory.writes;

    expect(
      await controller.transferGuestToCustomer(),
      EventListResult.unauthorized,
    );

    expect(memory.writes, before);
    expect(controller.list, isNull);

    final guest = await store.guestRead(authorize: allow);
    expect(guest.entries, hasLength(1));
  });

  test('session change during customer write cannot publish success', () async {
    await store.guestAddPackage(entry(), authorize: allow);

    memory.enteredWrite = Completer<void>();
    memory.writeGate = Completer<void>();

    final transfer = controller.transferGuestToCustomer();

    try {
      await memory.enteredWrite!.future;

      // The old customer's write may already have been dispatched,
      // but it must never be published to the new session.
      auth.switchTo('customer_B');
    } finally {
      if (!memory.writeGate!.isCompleted) {
        memory.writeGate!.complete();
      }
    }

    expect(await transfer, EventListResult.unauthorized);
    expect(controller.list, isNull);

    final guest = await store.guestRead(authorize: allow);
    expect(guest.entries, hasLength(1));

    final other = await store.read('customer_B', authorize: allow);
    expect(other.entries, isEmpty);
  });

  test('capacity failure is returned without modifying guest data', () async {
    for (var i = 0; i < 24; i++) {
      await store.addPackage('customer_A', entry(i), authorize: allow);
    }
    await store.guestAddPackage(entry(25), authorize: allow);

    final writesBefore = memory.writes;

    expect(
      await controller.transferGuestToCustomer(),
      EventListResult.capacity,
    );

    expect(memory.writes, writesBefore);
    expect((await store.guestRead(authorize: allow)).entries, hasLength(1));
  });
}
