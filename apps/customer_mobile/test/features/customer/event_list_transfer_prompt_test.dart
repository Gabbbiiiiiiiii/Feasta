import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';

import 'customer_event_list_test.dart'
    show EventAuth, MemoryEventStorage, entry;

void allow() {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late EventAuth auth;
  late MemoryEventStorage memory;
  late EventListStore store;
  late EventListController controller;
  late GlobalKey<NavigatorState> navigatorKey;

  setUp(() {
    auth = EventAuth()..switchTo(null);
    memory = MemoryEventStorage();
    store = EventListStore(storage: memory);
    controller = EventListController(
      store: store,
      authentication: auth,
      signedOutGuest: () => false,
    );
    navigatorKey = GlobalKey<NavigatorState>();
  });

  tearDown(() {
    controller.dispose();
    auth.dispose();
  });

  Widget app({bool includeNavigator = true}) {
    return EventListScope(
      controller: controller,
      navigatorKey: navigatorKey,
      child: includeNavigator
          ? MaterialApp(
              navigatorKey: navigatorKey,
              home: const Scaffold(body: Text('FEASTA Home')),
            )
          : const SizedBox.shrink(),
    );
  }

  Future<void> signedIn(WidgetTester tester) async {
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    auth.switchTo('customer_A');
    await tester.pumpAndSettle();
  }

  testWidgets('Not Now preserves guest selections', (tester) async {
    await store.guestAddPackage(entry(), authorize: allow);

    await signedIn(tester);

    expect(find.text('Add saved packages to your account?'), findsOneWidget);

    await tester.tap(find.text('Not Now'));
    await tester.pumpAndSettle();

    expect(find.text('Add saved packages to your account?'), findsNothing);

    expect((await store.guestRead(authorize: allow)).entries, hasLength(1));
    expect((await store.read('customer_A', authorize: allow)).entries, isEmpty);

    // Ordinary auth notifications should not reopen a dismissed prompt.
    auth.emit();
    await tester.pumpAndSettle();
    expect(find.text('Add saved packages to your account?'), findsNothing);
  });

  testWidgets('Add to My Account merges without duplicates', (tester) async {
    await store.addPackage('customer_A', entry(), authorize: allow);
    await store.guestAddPackage(entry(), authorize: allow);
    await store.guestAddPackage(entry(1), authorize: allow);

    await signedIn(tester);

    expect(find.text('Add saved packages to your account?'), findsOneWidget);

    await tester.tap(find.text('Add to My Account'));
    await tester.pumpAndSettle();

    final customer = await store.read('customer_A', authorize: allow);
    final guest = await store.guestRead(authorize: allow);

    expect(customer.entries, hasLength(2));
    expect(customer.entries.map((item) => item.packageId).toSet(), {
      'package_0',
      'package_1',
    });
    expect(guest.entries, isEmpty);
  });

  testWidgets('switching customer closes old confirmation', (tester) async {
    await store.guestAddPackage(entry(), authorize: allow);
    await signedIn(tester);

    expect(find.text('Add saved packages to your account?'), findsOneWidget);

    auth.switchTo(null);
    await tester.pumpAndSettle();

    expect(find.text('Add saved packages to your account?'), findsNothing);
    expect((await store.guestRead(authorize: allow)).entries, hasLength(1));
  });

  testWidgets('Navigator becoming available does not lose the prompt', (
    tester,
  ) async {
    await store.guestAddPackage(entry(), authorize: allow);

    // Authorization occurs while the Navigator is not mounted.
    await tester.pumpWidget(app(includeNavigator: false));
    auth.switchTo('customer_A');
    await tester.pumpAndSettle();

    // The Navigator is subsequently created.
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    expect(find.text('Add saved packages to your account?'), findsOneWidget);
  });
}
