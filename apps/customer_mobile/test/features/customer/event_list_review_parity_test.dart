import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/save_review_configuration.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'customer_event_list_test.dart'
    show EventAuth, MemoryEventStorage, entry;
import 'booking_preparation_test.dart' show preparationPackage;
import 'provider_discovery_test.dart' show provider;
import 'save_review_configuration_test.dart' show data;

class GuestAuth extends EventAuth {
  @override
  bool get guestPlanningAllowed => true;
}

void main() {
  late MemoryEventStorage memory;
  late GuestAuth auth;
  late EventListController controller;
  setUp(() {
    memory = MemoryEventStorage();
    auth = GuestAuth();
    controller = EventListController(
      store: EventListStore(storage: memory),
      authentication: auth,
      signedOutGuest: () => true,
    );
  });
  tearDown(() {
    controller.dispose();
    auth.dispose();
  });
  final package = preparationPackage({
    'serviceOptions': {
      'full_service': {'price': 100},
    },
    'themeOptions': [
      {'id': 'garden', 'name': 'Garden'},
    ],
  });
  CustomerEventListEntry configured(String notes) => reviewEventListEntry(
    provider: provider(),
    package: package,
    data: data(notes: notes),
  );
  Future<void> settle(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pumpAndSettle();
  }

  Future<void> open(WidgetTester tester, {EventListIdentity? identity}) async {
    await tester.pumpWidget(
      EventListScope(
        controller: controller,
        child: MaterialApp(
          home: Scaffold(
            body: SaveReviewConfiguration(
              provider: provider(),
              package: package,
              data: data(),
              editingIdentity: identity,
              isAuthorized: () => true,
            ),
          ),
        ),
      ),
    );
    await settle(tester);
  }

  test(
    'guest add and review mutation are denied without storage writes',
    () async {
      auth.switchTo(null);
      expect(
        await controller.addPackage(entry()),
        EventListResult.unauthorized,
      );
      expect(
        await controller.saveConfiguration(entry(), expectedRevision: 0),
        EventListResult.unauthorized,
      );
      expect(memory.writes, 0);
    },
  );

  test(
    'edit preserves identity and unrelated entries; stale edits cannot restore removals',
    () async {
      final original = configured('Original');
      await controller.addPackage(original);
      await controller.addPackage(entry(7));
      final revision = controller.list!.revision;
      expect(
        await controller.saveConfiguration(
          configured('Updated'),
          expectedRevision: revision,
          editingIdentity: original.identity,
        ),
        EventListResult.saved,
      );
      expect(controller.list!.entries.map((e) => e.identity.key), [
        entry(7).identity.key,
        original.identity.key,
      ]);
      expect(
        controller.list!.entries.last.configuration!.event.specialRequest,
        'Updated',
      );
      for (final clear in [false, true]) {
        await controller.addPackage(original);
        final before = controller.list!.revision;
        if (clear) {
          await controller.clear();
        } else {
          await controller.removePackage(original.identity);
        }
        final writes = memory.writes;
        expect(
          await controller.saveConfiguration(
            original,
            expectedRevision: before,
            editingIdentity: original.identity,
          ),
          EventListResult.persistenceError,
        );
        expect(memory.writes, writes);
        expect(
          controller.list!.entries.any(
            (e) => e.identity.key == original.identity.key,
          ),
          false,
        );
      }
    },
  );

  test(
    'duplicate review and identity mismatch cannot overwrite entries',
    () async {
      final original = configured('Original');
      await controller.addPackage(original);
      final revision = controller.list!.revision;
      final writes = memory.writes;
      expect(
        await controller.saveConfiguration(
          configured('Duplicate'),
          expectedRevision: revision,
        ),
        EventListResult.persistenceError,
      );
      expect(
        await controller.saveConfiguration(
          configured('Wrong identity'),
          expectedRevision: revision,
          editingIdentity: entry(8).identity,
        ),
        EventListResult.persistenceError,
      );
      expect(memory.writes, writes);
      expect(
        controller.list!.entries.single.configuration!.event.specialRequest,
        'Original',
      );
    },
  );

  test(
    'queued review is invalidated by same-account session renewal',
    () async {
      await controller.load();
      memory.readGate = Completer<void>();
      memory.enteredRead = Completer<void>();
      final pending = controller.saveConfiguration(
        entry(),
        expectedRevision: 0,
      );
      await memory.enteredRead!.future;
      auth.switchTo('customer_A', newSession: true);
      memory.readGate!.complete();
      expect(await pending, EventListResult.unauthorized);
      expect(memory.writes, 0);
      expect(controller.list, isNull);
    },
  );

  testWidgets(
    'reopening detects saved entries, session changes disable actions, missing edits show recovery',
    (tester) async {
      await tester.runAsync(
        () => controller.addPackage(configured('Original')),
      );
      await open(tester);
      expect(find.text('Already in Event List'), findsOneWidget);
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull,
      );
      await tester.pumpWidget(const SizedBox());
      await open(tester);
      expect(find.text('Already in Event List'), findsOneWidget);
      auth.switchTo('customer_B');
      await settle(tester);
      expect(find.textContaining('Your session changed'), findsOneWidget);
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull,
      );
      await tester.pumpWidget(const SizedBox());
      await settle(tester);
      auth.switchTo('customer_A');
      final original = configured('Original');
      await tester.runAsync(() async {
        await controller.addPackage(original);
        await controller.clear();
      });
      await open(tester, identity: original.identity);
      expect(find.text('Return to Event List'), findsOneWidget);
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull,
      );
      expect(controller.list!.entries, isEmpty);
      await tester.pumpWidget(const SizedBox());
      await settle(tester);
    },
  );
}
