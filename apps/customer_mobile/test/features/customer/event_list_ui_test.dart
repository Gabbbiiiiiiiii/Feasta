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
import 'package:feasta/features/customer/event_list/event_list_catalog.dart';
import 'package:feasta/shared/models/feasta_models.dart';
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
  late EventListCatalog catalog;
  void reset() {
    memory = MemoryEventStorage();
    auth = EventAuth();
    controller = EventListController(
      store: EventListStore(storage: memory),
      authentication: auth,
    );
    catalog = EventListCatalog(lookup: (_, _) async => null);
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
          home: child ?? CustomerEventListScreen(catalog: catalog),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  List<SemanticsNode> exposed(WidgetTester tester) {
    final nodes = <SemanticsNode>[];
    void walk(SemanticsNode node) {
      nodes.add(node);
      for (final child in node.debugListChildrenInOrder(
        DebugSemanticsDumpOrder.traversalOrder,
      )) {
        walk(child);
      }
    }

    walk(
      tester
          .binding
          .renderViews
          .single
          .owner!
          .semanticsOwner!
          .rootSemanticsNode!,
    );
    return nodes;
  }

  SemanticsNode labelled(WidgetTester tester, String label) {
    final nodes = exposed(
      tester,
    ).where((node) => node.label.split('\n').contains(label)).toList();
    expect(
      nodes,
      hasLength(1),
      reason: '$label: ${exposed(tester).map((node) => node.label).toList()}',
    );
    return nodes.single;
  }

  void status(WidgetTester tester, String label) {
    final nodes = exposed(
      tester,
    ).where((node) => node.label.split('\n').contains(label)).toList();
    expect(nodes, isNotEmpty, reason: label);
    expect(
      nodes.every(
        (node) => node.getSemanticsData().flagsCollection.isLiveRegion,
      ),
      isTrue,
    );
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
    expect(find.text('No saved estimate.'), findsOneWidget);
    expect(find.byIcon(Icons.storefront_outlined), findsOneWidget);
  });
  for (final fail in [false, true]) {
    scenario('remove exact tuple, write failure=$fail', (tester) async {
      await controller.addPackage(entry(0));
      await controller.addPackage(entry(0, 'provider_456'));
      await show(tester);
      memory.failWrite = fail;
      await tester.ensureVisible(find.text('Remove Package 0').first);
      await tester.pumpAndSettle();
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
      await tester.scrollUntilVisible(find.text('Clear List'), 150);
      await tester.ensureVisible(find.text('Clear List'));
      await tester.pumpAndSettle();
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
    await tester.scrollUntilVisible(find.text('Clear List'), 150);
    await tester.ensureVisible(find.text('Clear List'));
    await tester.pumpAndSettle();
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
    await tester.scrollUntilVisible(find.text('Clear List'), 150);
    await tester.ensureVisible(find.text('Clear List'));
    await tester.pumpAndSettle();
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
      const priceLabel = 'Saved estimate: 12,500.75 Philippine pesos.';
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
      await tester.ensureVisible(find.text('Clear List'));
      await tester.pumpAndSettle();
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
        tester.getSemantics(find.text('No saved estimate.')).label,
        contains('No saved estimate.'),
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
  scenario(
    'provider groups and mixed review results expose accessible actions',
    (tester) async {
      tester.view.physicalSize = const Size(800, 6000);
      tester.view.devicePixelRatio = 1;
      var calls = 0;
      var failed = true;
      final requested = <String>[];
      catalog = EventListCatalog(
        lookup: (provider, package) async {
          calls++;
          requested.add('$provider/$package');
          if (package == 'package_1' && failed) {
            throw StateError('private network error');
          }
          if (package == 'package_2') return null;
          return PackageModel.fromMap(package, {
            'providerId': provider,
            'name': 'Current name',
            'price': double.nan,
            'isActive': true,
            'isPublished': true,
            'providerPubliclyVisible': true,
            'isDeleted': false,
            'status': 'published',
          });
        },
      );
      for (var i = 0; i < 3; i++) {
        await controller.addPackage(
          entry(i, i == 1 ? 'provider_456' : 'provider_123'),
        );
      }
      await show(tester);
      expect(find.text('2 saved providers'), findsOneWidget);
      expect(find.byIcon(Icons.storefront_outlined), findsWidgets);
      final before = calls;
      await tester.pump();
      await tester.pump();
      expect(calls, before, reason: 'Rebuilds must not dispatch reads');
      expect(
        find.textContaining('currently unavailable for selection'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('1 packages from this provider'),
        150,
      );
      expect(find.text('1 packages from this provider'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Retry verification for Package 1'),
        150,
      );
      final semantics = tester.ensureSemantics();
      await tester.pumpAndSettle();
      status(
        tester,
        "We couldn't verify the latest package details. Please try again.",
      );
      final retry = labelled(
        tester,
        'Retry verification for Package 1',
      ).getSemanticsData();
      expect(retry.flagsCollection.isButton, isTrue);
      expect(retry.flagsCollection.isEnabled.toBoolOrNull(), isTrue);
      expect(retry.hasAction(SemanticsAction.tap), isTrue);
      expect(
        find.bySemanticsLabel('Retry verification for Package 1'),
        findsOneWidget,
      );
      expect(find.textContaining('private network error'), findsNothing);
      failed = false;
      await tester.tap(find.text('Retry verification for Package 1'));
      await tester.pumpAndSettle();
      expect(calls, before + 1);
      expect(requested.last, 'provider_456/package_1');
      expect(find.text('Retry verification for Package 1'), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Latest listed price unavailable.').last,
        150,
      );
      status(tester, 'Latest listed price unavailable.');
      expect(
        exposed(
          tester,
        ).any((node) => node.label.contains('Latest listed estimate:')),
        isFalse,
      );
      expect(find.text('Latest listed price unavailable.'), findsWidgets);
      expect(tester.takeException(), isNull);
      semantics.dispose();
    },
  );
  for (final latest in [11000.0, 13000.0, 12000.0]) {
    scenario('price change $latest at 320px and 200 percent is labelled once', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      var calls = 0;
      catalog = EventListCatalog(
        lookup: (provider, package) async {
          calls++;
          return PackageModel.fromMap(package, {
            'providerId': provider,
            'price': latest,
            'isActive': true,
            'isPublished': true,
            'providerPubliclyVisible': true,
            'isDeleted': false,
            'status': 'published',
          });
        },
      );
      await controller.addPackage(
        CustomerEventListEntry(
          providerId: 'provider_123',
          packageId: 'package_0',
          providerName:
              'Provider with a long saved name for family celebrations',
          packageName: 'Package 0',
          estimatedPrice: 12000,
        ),
      );
      final semantics = tester.ensureSemantics();
      await show(tester, scale: 2);
      expect(calls, 1);
      await tester.scrollUntilVisible(find.text('Latest listed estimate'), 150);
      final amount = latest == 11000
          ? '11,000.00'
          : latest == 13000
          ? '13,000.00'
          : '12,000.00';
      await tester.scrollUntilVisible(find.text('\u20b1$amount').last, 100);
      labelled(tester, 'Latest listed estimate: $amount Philippine pesos.');
      expect(
        exposed(tester)
            .expand((node) => node.label.split('\n'))
            .where(
              (line) =>
                  line == 'Latest listed estimate: $amount Philippine pesos.',
            ),
        hasLength(1),
      );
      expect(
        exposed(
          tester,
        ).where((node) => node.label.contains('Latest listed estimate:')),
        hasLength(1),
      );
      expect(
        tester.getSemantics(find.text('\u20b1$amount').last).label,
        contains('Latest listed estimate: $amount Philippine pesos.'),
      );
      await tester.scrollUntilVisible(find.text('Saved estimate'), -100);
      labelled(tester, 'Saved estimate: 12,000.00 Philippine pesos.');
      if (latest != 12000) {
        await tester.scrollUntilVisible(
          find.textContaining('The listed price has changed'),
          100,
        );
        labelled(
          tester,
          'The listed price has changed since you saved this package. Final pricing and availability require confirmation.',
        );
      } else {
        expect(
          find.textContaining('The listed price has changed'),
          findsNothing,
        );
      }
      expect(
        find.textContaining(
          'Final pricing and availability require confirmation.',
        ),
        latest == 12000 ? findsNothing : findsOneWidget,
      );
      expect(controller.list!.entries.single.estimatedPrice, 12000);

      expect(tester.takeException(), isNull);
      semantics.dispose();
    });
  }
  scenario(
    'pending checks allow Remove and Clear and lifecycle rechecks once',
    (tester) async {
      final gates = <Completer<PackageModel?>>[];
      catalog = EventListCatalog(
        lookup: (_, _) {
          final gate = Completer<PackageModel?>();
          gates.add(gate);
          return gate.future;
        },
      );
      await controller.addPackage(entry());
      await show(tester);
      expect(find.text('Checking latest package details'), findsOneWidget);
      await tester.ensureVisible(find.text('Remove Package 0'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove Package 0'));
      await tester.pumpAndSettle();
      expect(controller.list!.entries, isEmpty);
      gates.first.complete(null);
      await tester.pumpAndSettle();
      expect(find.textContaining('currently unavailable'), findsNothing);
      await controller.addPackage(entry());
      await tester.pumpAndSettle();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();
      expect(find.text('Latest package details not checked'), findsOneWidget);
      gates.last.complete(null);
      await tester.pumpAndSettle();
      final before = gates.length;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(gates.length, before + 1);
      await tester.scrollUntilVisible(find.text('Clear List'), 150);
      await tester.ensureVisible(find.text('Clear List'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Clear List'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm Clear List'));
      await tester.pumpAndSettle();
      gates.last.complete(null);
      await tester.pumpAndSettle();
      expect(controller.list!.entries, isEmpty);
      expect(find.textContaining('currently unavailable'), findsNothing);
    },
  );
  scenario(
    'unknown saved estimate and disposal never fabricate price changes',
    (tester) async {
      var failed = false;
      final gate = Completer<PackageModel?>();
      catalog = EventListCatalog(
        lookup: (provider, package) async {
          if (failed) return gate.future;
          return PackageModel.fromMap(package, {
            'providerId': provider,
            'price': 12000,
            'isActive': true,
            'isPublished': true,
            'providerPubliclyVisible': true,
            'isDeleted': false,
            'status': 'published',
          });
        },
      );
      await controller.addPackage(entry());
      final tree = tester.ensureSemantics();
      await show(tester);
      await tester.scrollUntilVisible(find.text('Latest listed estimate'), 100);
      labelled(tester, 'Latest listed estimate: 12,000.00 Philippine pesos.');
      labelled(tester, 'No saved estimate.');
      expect(
        exposed(tester).any((node) => node.label.startsWith('Saved estimate:')),
        isFalse,
      );
      tree.dispose();
      expect(find.text('No saved estimate.'), findsOneWidget);
      expect(find.text('Latest listed estimate'), findsOneWidget);
      expect(find.textContaining('The listed price has changed'), findsNothing);
      final semantics = tester.ensureSemantics();
      expect(find.bySemanticsLabel('Check latest details'), findsOneWidget);
      failed = true;
      await tester.tap(find.text('Check latest details'));
      await tester.pump();
      expect(find.text('Latest listed estimate'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      gate.completeError(StateError('private disposed error'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      semantics.dispose();
    },
  );
  scenario(
    'semantics traversal groups equal names and invalidates completed prices',
    (tester) async {
      tester.view.physicalSize = const Size(800, 6000);
      tester.view.devicePixelRatio = 1;
      final semantics = tester.ensureSemantics();
      final gate = Completer<PackageModel?>();
      var refresh = false;
      final calls = <String>[];
      catalog = EventListCatalog(
        lookup: (provider, package) async {
          calls.add('$provider/$package');
          if (refresh) return gate.future;
          if (package == 'package_1') return null;
          return PackageModel.fromMap(package, {
            'providerId': provider,
            'price': 12500.75,
            'isActive': true,
            'isPublished': true,
            'providerPubliclyVisible': true,
            'isDeleted': false,
            'status': 'published',
          });
        },
      );
      await controller.addPackage(entry(0));
      await controller.addPackage(entry(1, 'provider_456'));
      await show(tester);
      final headings = exposed(
        tester,
      ).where((node) => node.label == 'Provider, 1 saved packages').toList();
      expect(headings, hasLength(2));
      for (final heading in headings) {
        expect(heading.getSemanticsData().flagsCollection.isHeader, isTrue);
      }
      final labels = exposed(
        tester,
      ).expand((node) => node.label.split('\n')).toList();
      final first = labels.indexOf('Provider, 1 saved packages');
      final second = labels.lastIndexOf('Provider, 1 saved packages');
      expect(labels.indexOf('Package 1'), greaterThan(first));
      expect(labels.indexOf('Package 1'), lessThan(second));
      expect(labels.indexOf('Package 0'), greaterThan(second));
      status(tester, 'Latest package details verified');
      status(tester, 'This package is currently unavailable for selection');
      labelled(tester, 'Latest listed estimate: 12,500.75 Philippine pesos.');
      refresh = true;
      await tester.tap(find.text('Check latest details'));
      await tester.pumpAndSettle();
      final checking = exposed(tester).where(
        (node) =>
            node.label.split('\n').contains('Checking latest package details'),
      );
      expect(checking, hasLength(2));
      expect(
        checking.every(
          (node) => node.getSemanticsData().flagsCollection.isLiveRegion,
        ),
        isTrue,
      );
      expect(
        exposed(tester).any(
          (node) =>
              node.label.contains('12,500.75') ||
              node.label.contains('currently unavailable') ||
              node.label.contains('details verified'),
        ),
        isFalse,
      );
      expect(
        exposed(tester).any(
          (node) =>
              node.label.startsWith('Retry verification') &&
              node.getSemanticsData().hasAction(SemanticsAction.tap),
        ),
        isFalse,
      );
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pumpAndSettle();
      final unchecked = exposed(tester).where(
        (node) => node.label
            .split('\n')
            .contains('Latest package details not checked'),
      );
      expect(unchecked, hasLength(2));
      expect(
        unchecked.every(
          (node) => node.getSemanticsData().flagsCollection.isLiveRegion,
        ),
        isTrue,
      );
      auth.switchTo('customer_B');
      await tester.pumpAndSettle();
      expect(
        exposed(tester).any(
          (node) =>
              node.label.contains('Provider,') ||
              node.label.contains('Package 0') ||
              node.label.contains('not checked') ||
              node.label.contains('12,500.75'),
        ),
        isFalse,
      );
      gate.complete(null);
      await tester.pumpAndSettle();
      expect(
        exposed(
          tester,
        ).any((node) => node.label.contains('currently unavailable')),
        isFalse,
      );
      semantics.dispose();
    },
  );
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
