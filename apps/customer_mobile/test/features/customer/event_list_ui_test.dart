import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/customer_event_list_screen.dart';
import 'package:feasta/features/customer/event_list/save_package_to_event_list.dart';
import 'customer_event_list_test.dart'
    show MemoryEventStorage, EventAuth, entry;
import 'provider_discovery_test.dart' show provider, GuestAuth;
import 'booking_preparation_test.dart' show preparationPackage;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = GuestAuth();
  });
  late MemoryEventStorage memory;
  late EventAuth auth;
  late EventListController controller;
  void reset() {
    memory = MemoryEventStorage();
    auth = EventAuth();
    controller = EventListController(
      store: EventListStore(storage: memory),
      authentication: auth,
    );
  }

  final scenarios = <String, Future<void> Function(WidgetTester)>{};
  void scenario(String name, Future<void> Function(WidgetTester) body) {
    scenarios[name] = body;
  }

  Future<void> show(
    WidgetTester tester, {
    Widget? child,
    double scale = 1,
  }) async {
    await tester.pumpWidget(
      EventListScope(
        controller: controller,
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: child ?? const CustomerEventListScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Widget save({Map<String, dynamic> changes = const {}}) => Scaffold(
    body: SingleChildScrollView(
      child: SavePackageToEventList(
        provider: provider(),
        eventPackage: preparationPackage(changes),
      ),
    ),
  );
  scenario('empty list is verified and Continue Browsing is accessible', (
    tester,
  ) async {
    await show(tester);
    expect(find.textContaining('Your Event List is empty'), findsOneWidget);
    expect(find.text('0 saved packages'), findsOneWidget);
    expect(
      find.widgetWithText(FilledButton, 'Continue Browsing'),
      findsOneWidget,
    );
    expect(memory.writes, 0);
  });
  scenario('read failure is not represented as empty and retry restores list', (
    tester,
  ) async {
    memory.failRead = true;
    await show(tester);
    expect(find.textContaining('could not be verified'), findsOneWidget);
    expect(find.textContaining('Your Event List is empty'), findsNothing);
    memory.failRead = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('0 saved packages'), findsOneWidget);
  });
  scenario('restored saved cards show package cover fallback and estimate', (
    tester,
  ) async {
    await controller.addPackage(entry());
    await show(tester);
    expect(find.text('Package 0'), findsOneWidget);
    expect(find.text('Provider'), findsOneWidget);
    expect(find.text('Estimate unavailable'), findsOneWidget);
    expect(find.byIcon(Icons.storefront_outlined), findsOneWidget);
  });
  for (final fail in [false, true]) {
    scenario('remove exact tuple, write failure=$fail', (tester) async {
      await controller.addPackage(entry(0));
      await controller.addPackage(entry(0, 'provider_456'));
      await show(tester);
      memory.failWrite = fail;
      await tester.tap(find.text('Remove Package 0').first);
      await tester.pumpAndSettle();
      expect(controller.list!.entries.length, fail ? 2 : 1);
      if (!fail) {
        expect(controller.list!.entries.single.providerId, 'provider_123');
      }
      if (fail) {
        expect(
          find.textContaining('Could not verify your Event List'),
          findsOneWidget,
        );
      }
    });
    scenario('confirmed clear, write failure=$fail', (tester) async {
      await controller.addPackage(entry());
      await show(tester);
      await tester.ensureVisible(find.text('Clear List'));
      await tester.tap(find.text('Clear List'));
      await tester.pumpAndSettle();
      memory.failWrite = fail;
      await tester.tap(find.text('Confirm Clear List'));
      await tester.pumpAndSettle();
      expect(controller.list!.entries.length, fail ? 1 : 0);
      if (!fail) expect(memory.values.values.single, contains('"entries":[]'));
    });
  }
  scenario('cancel clear never writes', (tester) async {
    await controller.addPackage(entry());
    await show(tester);
    final writes = memory.writes;
    await tester.ensureVisible(find.text('Clear List'));
    await tester.tap(find.text('Clear List'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(memory.writes, writes);
    expect(controller.list!.entries, hasLength(1));
  });
  scenario('account change during clear confirmation cannot clear B', (
    tester,
  ) async {
    await controller.addPackage(entry());
    await show(tester);
    await tester.ensureVisible(find.text('Clear List'));
    await tester.tap(find.text('Clear List'));
    await tester.pumpAndSettle();
    auth.switchTo('customer_B');
    await tester.pumpAndSettle();
    final writes = memory.writes;
    await tester.tap(find.text('Confirm Clear List'));
    await tester.pumpAndSettle();
    expect(memory.writes, writes);
    auth.switchTo('customer_A');
    await tester.pumpAndSettle();
    expect(controller.list!.entries, hasLength(1));
  });
  scenario('shared scope reconstructs A to B to A and sign-out', (
    tester,
  ) async {
    await controller.addPackage(entry());
    await show(tester);
    auth.switchTo('customer_B');
    await tester.pumpAndSettle();
    expect(find.text('Package 0'), findsNothing);
    expect(find.text('0 saved packages'), findsOneWidget);
    auth.switchTo('customer_A');
    await tester.pumpAndSettle();
    expect(find.text('Package 0'), findsOneWidget);
    auth.switchTo(null);
    await tester.pumpAndSettle();
    expect(find.text('Package 0'), findsNothing);
    expect(find.textContaining('authorized customer'), findsOneWidget);
  });
  for (final fail in [false, true]) {
    scenario(
      'package save feedback requires verified persistence, failure=$fail',
      (tester) async {
        await show(tester, child: save());
        memory.failWrite = fail;
        await tester.tap(find.text('Add to Event List'));
        await tester.pumpAndSettle();
        expect(
          find.text('Added to Event List'),
          fail ? findsNothing : findsWidgets,
        );
        expect(controller.list!.entries.length, fail ? 0 : 1);
        if (!fail) {
          await tester.tap(
            find.widgetWithText(OutlinedButton, 'Added to Event List'),
          );
          await tester.pumpAndSettle();
          expect(controller.list!.entries, hasLength(1));
          expect(controller.list!.entries.single.estimatedPrice, 12000);
        }
      },
    );
  }
  scenario('unknown price stays unknown and invalid image uses fallback', (
    tester,
  ) async {
    await show(
      tester,
      child: save(
        changes: {'price': 'unknown', 'imageUrl': 'http://example.com/image'},
      ),
    );
    await tester.tap(find.text('Add to Event List'));
    await tester.pumpAndSettle();
    expect(controller.list!.entries.single.estimatedPrice, isNull);
    expect(controller.list!.entries.single.imageUrl, isNull);
  });
  scenario('capacity failure retains 24 existing selections', (tester) async {
    for (var i = 0; i < 24; i++) {
      await controller.addPackage(entry(i));
    }
    await show(tester, child: save());
    await tester.tap(find.text('Add to Event List'));
    await tester.pumpAndSettle();
    expect(find.textContaining('full (24 packages)'), findsOneWidget);
    expect(controller.list!.entries, hasLength(24));
  });
  scenario('duplicate taps and sign-out while saving suppress old success', (
    tester,
  ) async {
    await show(tester, child: save());
    memory.writeGate = Completer<void>();
    memory.enteredWrite = Completer<void>();
    await tester.tap(find.text('Add to Event List'));
    await tester.pump();
    await memory.enteredWrite!.future;
    expect(
      tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
      isNull,
    );
    auth.switchTo(null);
    await tester.pump();
    memory.writeGate!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Added to Event List'), findsNothing);
    expect(controller.list, isNull);
    expect(memory.writes, 1);
  });
  scenario('small screen and 200 percent text allow scrolling actions', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await controller.addPackage(entry());
    await show(tester, scale: 2);
    await tester.scrollUntilVisible(find.text('Remove Package 0'), 200);
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(find.text('Continue Browsing'), 200);
    expect(tester.takeException(), isNull);
  });
  scenario('shared controller survives routes and scope detaches listener', (
    tester,
  ) async {
    await show(tester, child: save());
    await tester.tap(find.text('Add to Event List'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('View Event List'));
    await tester.pumpAndSettle();
    expect(find.text('My Event List'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Continue Browsing'), 200);
    await tester.tap(find.text('Continue Browsing'));
    await tester.pumpAndSettle();
    expect(find.text('Added to Event List'), findsWidgets);
    await tester.pumpWidget(const SizedBox());
    auth.switchTo('customer_B');
    expect(tester.takeException(), isNull);
  });
  scenario(
    'guest save and list navigation require existing login and never write',
    (tester) async {
      auth.switchTo(null);
      await show(tester, child: save());
      await tester.tap(find.text('Add to Event List'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Log in to save packages'), findsOneWidget);
      expect(memory.writes, 0);
      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('View Event List'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Log in to view your customer Event List'),
        findsOneWidget,
      );
      expect(find.text('My Event List'), findsNothing);
      expect(memory.writes, 0);
      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      // Let the existing Google policy loader finish its bounded timeout retries.
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(seconds: 11));
      }
      await tester.pumpAndSettle();
    },
  );
  scenario(
    'callbacks from the previous rendered account cannot mutate the new account',
    (tester) async {
      await controller.addPackage(entry());
      await show(tester);
      final remove = tester
          .widget<TextButton>(
            find.widgetWithText(TextButton, 'Remove Package 0'),
          )
          .onPressed!;
      auth.switchTo('customer_B');
      await controller.addPackage(entry());
      final writes = memory.writes;
      remove();
      await tester.pumpAndSettle();
      expect(memory.writes, writes);
      expect(controller.list!.ownerUid, 'customer_B');
      expect(controller.list!.entries, hasLength(1));
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      await show(tester, child: save());
      final add = tester
          .widget<OutlinedButton>(find.byType(OutlinedButton))
          .onPressed!;
      auth.switchTo('customer_A');
      final before = memory.writes;
      add();
      await tester.pumpAndSettle();
      expect(memory.writes, before);
    },
  );
  scenario('priced long-name card semantics at 320px and 200 percent', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      const packageName =
          'Celebration package with catering and decorations for family gatherings';
      const providerName =
          'FEASTA catering and event preparation services for family celebrations';
      const priceLabel = 'Estimated price: 12,500.75 Philippine pesos.';
      await controller.addPackage(
        CustomerEventListEntry(
          providerId: 'provider_123',
          packageId: 'priced_package',
          packageName: packageName,
          providerName: providerName,
          estimatedPrice: 12500.75,
        ),
      );
      await show(tester, scale: 2);
      await tester.scrollUntilVisible(find.text('\u20b112,500.75'), 100);
      await tester.pumpAndSettle();
      final price = tester.getSemantics(find.text('\u20b112,500.75'));
      expect(price.label, contains(priceLabel));
      var priceNodes = 0;
      void inspect(SemanticsNode node) {
        if (node.label.contains('12,500.75')) priceNodes++;
        node.visitChildren((child) {
          inspect(child);
          return true;
        });
      }

      var root = price;
      while (root.parent != null) {
        root = root.parent!;
      }
      inspect(root);
      expect(priceNodes, 1, reason: 'The visible price must be announced once');
      expect(
        tester
            .getRect(find.text('\u20b112,500.75'))
            .overlaps(const Rect.fromLTWH(0, 0, 320, 640)),
        isTrue,
      );
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(find.text('Remove $packageName'), 100);
      expect(
        tester.getSemantics(
          find.widgetWithText(TextButton, 'Remove $packageName'),
        ),
        matchesSemantics(
          label: 'Remove $packageName',
          isButton: true,
          hasEnabledState: true,
          isEnabled: true,
          isFocusable: true,
          hasTapAction: true,
          hasFocusAction: true,
        ),
      );
      await tester.scrollUntilVisible(find.text('Clear List'), 100);
      expect(find.bySemanticsLabel('Clear List'), findsOneWidget);
      await tester.tap(find.text('Clear List'));
      await tester.pumpAndSettle();
      for (final label in ['Cancel', 'Confirm Clear List']) {
        expect(
          tester
              .getSemantics(find.widgetWithText(TextButton, label))
              .getSemanticsData()
              .hasAction(SemanticsAction.tap),
          isTrue,
        );
      }
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Remove $packageName'));
      await tester.tap(find.text('Remove $packageName'));
      await tester.pumpAndSettle();
      expect(
        find.bySemanticsLabel(RegExp('12,500.75|Remove $packageName')),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Continue Browsing'));
    } finally {
      semantics.dispose();
    }
  });
  scenario('unknown price, loading and read error expose semantics', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      memory.readGate = Completer<void>();
      await tester.pumpWidget(
        EventListScope(
          controller: controller,
          child: const MaterialApp(home: CustomerEventListScreen()),
        ),
      );
      await tester.pump();
      expect(find.bySemanticsLabel('Loading Event List'), findsOneWidget);
      expect(find.bySemanticsLabel('Updating Event List'), findsOneWidget);
      memory.failRead = true;
      memory.readGate!.complete();
      await tester.pumpAndSettle();
      expect(
        find.bySemanticsLabel(RegExp('Your Event List could not be verified')),
        findsOneWidget,
      );
      expect(
        tester
            .getSemantics(find.widgetWithText(TextButton, 'Retry'))
            .getSemanticsData()
            .hasAction(SemanticsAction.tap),
        isTrue,
      );
      memory.failRead = false;
      memory.readGate = null;
      await controller.addPackage(entry());
      await tester.pumpAndSettle();
      expect(
        tester.getSemantics(find.text('Estimate unavailable')).label,
        contains('Estimate unavailable'),
      );
      expect(
        find.bySemanticsLabel(
          RegExp('Philippine pesos|Price:|Estimated price:'),
        ),
        findsNothing,
      );
    } finally {
      semantics.dispose();
    }
  });
  // The production store intentionally shares a process-wide Future queue. Keep
  // these scenarios in one fake-async zone so failed futures never cross the
  // separate error zones created by individual testWidgets invocations.
  testWidgets(
    'Event List UI: ${scenarios.length} persistence, isolation, navigation and accessibility scenarios',
    (tester) async {
      for (final scenario in scenarios.entries) {
        reset();
        try {
          await scenario.value(tester);
          await tester.pumpWidget(const SizedBox());
          await tester.pumpAndSettle();
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        } catch (error, stack) {
          fail('${scenario.key}: $error\n$stack');
        } finally {
          controller.dispose();
          auth.dispose();
        }
      }
    },
  );
}
