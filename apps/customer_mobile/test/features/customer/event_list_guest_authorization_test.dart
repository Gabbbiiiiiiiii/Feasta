import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';

import 'customer_event_list_test.dart'
    show EventAuth, MemoryEventStorage, entry;

class GuestPlanningAuth extends EventAuth {
  @override
  bool get guestPlanningAllowed => true;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MemoryEventStorage memory;
  late EventListStore store;
  late GuestPlanningAuth auth;
  late EventListController controller;
  bool signedOut = true;

  setUp(() {
    memory = MemoryEventStorage();
    store = EventListStore(storage: memory);
    auth = GuestPlanningAuth()..switchTo(null);
    signedOut = true;

    controller = EventListController(
      store: store,
      authentication: auth,
      signedOutGuest: () => signedOut,
    );
  });

  tearDown(() {
    controller.dispose();
    auth.dispose();
  });

  test(
    'planning guest cannot add a package through customer-only API',
    () async {
      expect(controller.isGuestPlanning, isTrue);
      expect(await controller.load(), EventListResult.loaded);
      expect(controller.list!.entries, isEmpty);

      expect(
        await controller.addPackage(entry()),
        EventListResult.unauthorized,
      );

      expect(controller.list!.entries, isEmpty);
      expect(controller.list!.ownerUid, EventListStore.guestOwnerUid);

      expect(await controller.load(), EventListResult.loaded);
      expect(controller.list!.entries, isEmpty);

      // Guest storage must not write into a customer-owned record.
      expect(memory.values.containsKey(store.key('customer_A')), isFalse);
      expect(memory.writes, 0);
      expect(memory.values, isEmpty);
    },
  );

  test('guest can remove saved planning selections', () async {
    // Seed existing device-local selections, not a customer-only API save.
    void authorizeGuestFixture() {
      if (!controller.isGuestPlanning) {
        throw StateError('Guest session changed');
      }
    }

    await store.guestAddPackage(entry(), authorize: authorizeGuestFixture);
    await store.guestAddPackage(entry(1), authorize: authorizeGuestFixture);
    expect(await controller.load(), EventListResult.loaded);

    expect(controller.list!.entries, hasLength(2));

    expect(
      await controller.removePackage(entry().identity),
      EventListResult.saved,
    );

    expect(controller.list!.entries, hasLength(1));
    expect(controller.list!.entries.single.packageId, 'package_1');

    expect(await controller.clear(), EventListResult.saved);
    expect(controller.list!.entries, isEmpty);
    expect(await controller.load(), EventListResult.loaded);
    expect(controller.list!.entries, isEmpty);
  });

  test('customer session cannot inherit guest list state', () async {
    // Existing guest storage remains separate until an explicit transfer.
    await store.guestAddPackage(
      entry(),
      authorize: () {
        if (!controller.isGuestPlanning) {
          throw StateError('Guest session changed');
        }
      },
    );
    expect(await controller.load(), EventListResult.loaded);
    expect(controller.list!.ownerUid, EventListStore.guestOwnerUid);

    signedOut = false;
    auth.switchTo('customer_A');

    expect(controller.isGuestPlanning, isFalse);
    expect(controller.list, isNull);

    expect(await controller.load(), EventListResult.loaded);
    expect(controller.list!.ownerUid, 'customer_A');
    expect(controller.list!.entries, isEmpty);

    expect(await controller.addPackage(entry(2)), EventListResult.saved);

    expect(controller.list!.entries.single.packageId, 'package_2');

    signedOut = true;
    auth.switchTo(null);

    expect(controller.list, isNull);

    expect(await controller.load(), EventListResult.loaded);
    expect(controller.list!.ownerUid, EventListStore.guestOwnerUid);
    expect(controller.list!.entries.single.packageId, 'package_0');
  });

  test('unauthorized guest adapter cannot access guest storage', () async {
    final deniedAuth = EventAuth()..switchTo(null);
    final deniedController = EventListController(
      store: store,
      authentication: deniedAuth,
      signedOutGuest: () => true,
    );

    try {
      expect(deniedController.isGuestPlanning, isFalse);
      expect(
        await deniedController.addPackage(entry()),
        EventListResult.unauthorized,
      );
      expect(await deniedController.load(), EventListResult.unauthorized);
      expect(deniedController.list, isNull);
      expect(memory.writes, 0);
    } finally {
      deniedController.dispose();
      deniedAuth.dispose();
    }
  });
}
