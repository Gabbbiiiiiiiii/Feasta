import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/guest_event_list_panel.dart';

import 'customer_event_list_test.dart'
    show EventAuth, MemoryEventStorage, entry;

class AllowedGuestAuth extends EventAuth {
  @override
  bool get guestPlanningAllowed => true;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // The store serializes work through a process-wide Future. Keep scenarios in
  // one fake-async zone so later tests do not await a previous test's dead zone.
  final scenarios = <String, Future<void> Function(WidgetTester)>{};
  void scenario(String name, Future<void> Function(WidgetTester) body) {
    scenarios[name] = body;
  }

  late AllowedGuestAuth auth;
  late EventListController controller;
  late MemoryEventStorage memory;
  bool signedOut = true;

  void reset() {
    memory = MemoryEventStorage();
    auth = AllowedGuestAuth()..switchTo(null);
    signedOut = true;
    controller = EventListController(
      store: EventListStore(storage: memory),
      authentication: auth,
      signedOutGuest: () => signedOut,
    );
  }

  void dispose() {
    controller.dispose();
    auth.dispose();
  }

  Future<void> showPanel(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GuestEventListPanel(
            controller: controller,
            session: controller.authentication.session,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  scenario('guest Clear All requires confirmation', (tester) async {
    await controller.store.guestAddPackage(entry(), authorize: () {});
    expect(await controller.load(), EventListResult.loaded);

    await showPanel(tester);

    expect(find.text('Package 0'), findsOneWidget);

    await tester.tap(find.text('Clear All'));
    await tester.pumpAndSettle();

    expect(find.text('Clear your Event List?'), findsOneWidget);
    expect(controller.list!.entries, hasLength(1));

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(controller.list!.entries, hasLength(1));
    expect(find.text('Package 0'), findsOneWidget);
  });

  scenario('guest Clear All removes saved packages', (tester) async {
    await controller.store.guestAddPackage(entry(), authorize: () {});
    expect(await controller.load(), EventListResult.loaded);

    await showPanel(tester);

    await tester.tap(find.text('Clear All'));
    await tester.pumpAndSettle();

    expect(controller.list!.entries, hasLength(1));

    await tester.tap(find.widgetWithText(FilledButton, 'Clear All'));
    // Bounded frame pumping after the asynchronous guest storage mutation.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump(const Duration(milliseconds: 100));

    expect(controller.list!.entries, isEmpty);
    expect(find.text('Your Event List is empty.'), findsOneWidget);

    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Clear All'))
          .onPressed,
      isNull,
    );
  });
  scenario('guest can view and remove a saved package', (tester) async {
    await controller.store.guestAddPackage(entry(), authorize: () {});
    expect(await controller.load(), EventListResult.loaded);

    await showPanel(tester);

    expect(find.text('Your Event List'), findsOneWidget);
    expect(find.text('Package 0'), findsOneWidget);
    expect(find.text('Provider'), findsOneWidget);

    await tester.tap(find.byTooltip('Remove Package 0'));
    await tester.pumpAndSettle();

    expect(find.text('Package 0'), findsNothing);
    expect(find.text('Your Event List is empty.'), findsOneWidget);

    expect(await controller.load(), EventListResult.loaded);
    expect(controller.list!.entries, isEmpty);
  });

  scenario('panel hides saved items after an account change', (tester) async {
    await controller.store.guestAddPackage(entry(), authorize: () {});
    expect(await controller.load(), EventListResult.loaded);
    await showPanel(tester);

    expect(find.text('Package 0'), findsOneWidget);

    signedOut = false;
    auth.switchTo('customer_A');
    await tester.pumpAndSettle();

    expect(find.text('Package 0'), findsNothing);
    expect(find.textContaining('Your account session changed'), findsOneWidget);
  });

  scenario('panel does not expose items after guest permission is lost', (
    tester,
  ) async {
    await controller.store.guestAddPackage(entry(), authorize: () {});
    expect(await controller.load(), EventListResult.loaded);
    await showPanel(tester);

    expect(find.text('Package 0'), findsOneWidget);

    signedOut = false;
    auth.emit();
    await tester.pumpAndSettle();

    expect(find.text('Package 0'), findsNothing);
    expect(find.byTooltip('Remove Package 0'), findsNothing);
  });
  testWidgets(
    'guest scenarios: ${scenarios.length} isolated fixtures in one storage zone',
    (tester) async {
      for (final scenario in scenarios.entries) {
        debugPrint('SCENARIO START: ${scenario.key}');
        reset();
        try {
          await scenario.value(tester);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
          debugPrint('SCENARIO PASS: ${scenario.key}');
        } catch (error, stack) {
          fail('${scenario.key}: $error\n$stack');
        } finally {
          dispose();
        }
      }
    },
  );
}
