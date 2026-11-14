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

  late AllowedGuestAuth auth;
  late EventListController controller;
  late MemoryEventStorage memory;
  bool signedOut = true;

  setUp(() {
    memory = MemoryEventStorage();
    auth = AllowedGuestAuth()..switchTo(null);
    signedOut = true;
    controller = EventListController(
      store: EventListStore(storage: memory),
      authentication: auth,
      signedOutGuest: () => signedOut,
    );
  });

  tearDown(() {
    controller.dispose();
    auth.dispose();
  });

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

  testWidgets('guest Clear All requires confirmation', (tester) async {
    expect(await controller.load(), EventListResult.loaded);
    expect(await controller.addPackage(entry()), EventListResult.saved);

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

  testWidgets('guest Clear All removes saved packages', (tester) async {
    expect(await controller.load(), EventListResult.loaded);
    expect(await controller.addPackage(entry()), EventListResult.saved);

    await showPanel(tester);

    await tester.tap(find.text('Clear All'));
    await tester.pumpAndSettle();

    expect(controller.list!.entries, hasLength(1));

    await tester.tap(find.widgetWithText(FilledButton, 'Clear All'));
    await tester.pumpAndSettle();

    expect(controller.list!.entries, isEmpty);
    expect(find.text('Your Event List is empty.'), findsOneWidget);

    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Clear All'))
          .onPressed,
      isNull,
    );
  });
  testWidgets('guest can view and remove a saved package', (tester) async {
    expect(await controller.load(), EventListResult.loaded);
    expect(await controller.addPackage(entry()), EventListResult.saved);

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

  testWidgets('panel hides saved items after an account change', (
    tester,
  ) async {
    await controller.addPackage(entry());
    await showPanel(tester);

    expect(find.text('Package 0'), findsOneWidget);

    signedOut = false;
    auth.switchTo('customer_A');
    await tester.pumpAndSettle();

    expect(find.text('Package 0'), findsNothing);
    expect(find.textContaining('Your account session changed'), findsOneWidget);
  });

  testWidgets('panel does not expose items after guest permission is lost', (
    tester,
  ) async {
    await controller.addPackage(entry());
    await showPanel(tester);

    expect(find.text('Package 0'), findsOneWidget);

    signedOut = false;
    auth.emit();
    await tester.pumpAndSettle();

    expect(find.text('Package 0'), findsNothing);
    expect(find.byTooltip('Remove Package 0'), findsNothing);
  });
}
