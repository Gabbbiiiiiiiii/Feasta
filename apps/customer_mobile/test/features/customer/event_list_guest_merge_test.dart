import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';

import 'customer_event_list_test.dart' show MemoryEventStorage, entry;

void allow() {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MemoryEventStorage memory;
  late EventListStore store;

  setUp(() {
    memory = MemoryEventStorage();
    store = EventListStore(storage: memory);
  });

  test('merges guest items into customer without duplicates', () async {
    await store.addPackage('customer_A', entry(), authorize: allow);
    await store.guestAddPackage(entry(), authorize: allow);
    await store.guestAddPackage(entry(1), authorize: allow);

    final result = await store.transferGuestToCustomer(
      'customer_A',
      authorize: allow,
    );

    expect(result.entries, hasLength(2));
    expect(result.entries.first.packageId, 'package_0');
    expect(result.entries.last.packageId, 'package_1');

    final customer = await store.read('customer_A', authorize: allow);
    final guest = await store.guestRead(authorize: allow);

    expect(customer.entries, hasLength(2));
    expect(guest.entries, isEmpty);
  });

  test('capacity rejection preserves both lists', () async {
    for (var index = 0; index < 24; index++) {
      await store.addPackage('customer_A', entry(index), authorize: allow);
    }

    await store.guestAddPackage(entry(25), authorize: allow);

    final writesBefore = memory.writes;

    await expectLater(
      store.transferGuestToCustomer('customer_A', authorize: allow),
      throwsA(isA<EventListCapacityException>()),
    );

    expect(memory.writes, writesBefore);

    final customer = await store.read('customer_A', authorize: allow);
    final guest = await store.guestRead(authorize: allow);

    expect(customer.entries, hasLength(24));
    expect(guest.entries, hasLength(1));
  });

  test('failed customer write preserves guest record', () async {
    await store.guestAddPackage(entry(), authorize: allow);
    memory.failWrite = true;

    await expectLater(
      store.transferGuestToCustomer('customer_A', authorize: allow),
      throwsStateError,
    );

    memory.failWrite = false;

    final guest = await store.guestRead(authorize: allow);
    final customer = await store.read('customer_A', authorize: allow);

    expect(guest.entries, hasLength(1));
    expect(customer.entries, isEmpty);
  });

  test('retry does not add duplicates', () async {
    await store.guestAddPackage(entry(), authorize: allow);

    await store.transferGuestToCustomer('customer_A', authorize: allow);
    await store.transferGuestToCustomer('customer_A', authorize: allow);

    final customer = await store.read('customer_A', authorize: allow);

    expect(customer.entries, hasLength(1));
  });

  test('authorization failure prevents transfer', () async {
    await store.guestAddPackage(entry(), authorize: allow);

    final writesBefore = memory.writes;

    await expectLater(
      store.transferGuestToCustomer(
        'customer_A',
        authorize: () => throw StateError('Session changed'),
      ),
      throwsStateError,
    );

    expect(memory.writes, writesBefore);

    final guest = await store.guestRead(authorize: allow);
    expect(guest.entries, hasLength(1));
  });
}
