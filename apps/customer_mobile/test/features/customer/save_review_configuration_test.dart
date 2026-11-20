import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/core/helpers/booking_preparation.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/save_review_configuration.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/shared/models/event_customization_data.dart';
import 'booking_preparation_test.dart' show preparationPackage;
import 'provider_discovery_test.dart' show provider;
import 'customer_event_list_test.dart' show EventAuth, MemoryEventStorage;

class _Auth extends EventAuth {
  bool guest = false;
  @override
  bool get guestPlanningAllowed => guest;
}

EventCustomizationData data({bool v2 = false, String notes = 'No peanuts'}) =>
    EventCustomizationData(
      sharedContractVersion: v2 ? 2 : null,
      expectedPackageRevision: v2 ? 7 : null,
      eventType: 'Wedding',
      eventDate: DateTime(2030, 6, 20),
      eventTime: '2:00 PM',
      eventEndTime: '6:00 PM',
      guestCount: 50,
      eventLocation: 'Ormoc City',
      eventAddress: 'Main Street',
      serviceTier: 'full_service',
      packageThemeId: 'garden',
      themeChoice: 'custom',
      customTheme: 'Rustic lights',
      selectedFoods: v2 ? [] : ['Rice'],
      selectedDecorations: ['Flowers'],
      selectedFurniture: ['Tables'],
      foodChoiceSelections: v2
          ? [
              {
                'groupId': 'main',
                'optionIds': ['fish'],
              },
            ]
          : [],
      selectedAddOns: [
        {
          'addonId': 'music',
          'providerId': 'provider_band',
          'name': 'Music',
          'providerBusinessName': 'Band',
          'providerType': 'addon_provider',
          'category': 'Music',
          'source': 'feasta_addon_provider',
          'price': 500,
          'bookingToken': 'must-not-be-saved',
        },
      ],
      willArrangeOwnAddOns: true,
      customerArrangedAddOnsNote: 'Own photographer',
      specialRequest: notes,
    );

final _packageChanges = {
  'pricingModel': 'per_pax',
  'serviceOptions': {
    'full_service': {'price': 100},
  },
  'themeOptions': [
    {'id': 'garden', 'name': 'Garden'},
  ],
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late MemoryEventStorage memory;
  late _Auth auth;
  late EventListStore store;
  late EventListController controller;
  bool signedOut = false, authorized = true;
  Future<void> resetFixture() async {
    memory = MemoryEventStorage();
    auth = _Auth();
    store = EventListStore(storage: memory);
    signedOut = false;
    authorized = true;
    controller = EventListController(
      store: store,
      authentication: auth,
      signedOutGuest: () => signedOut,
    );
  }

  setUp(resetFixture);
  tearDown(() {
    controller.dispose();
    auth.dispose();
  });
  final scenarios = <(String, Future<void> Function(WidgetTester))>[];
  void scenario(String name, Future<void> Function(WidgetTester) run) =>
      scenarios.add((name, run));
  Future<void> settle(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pumpAndSettle();
  }

  Future<void> open(WidgetTester tester, {bool v2 = false}) async {
    await tester.pumpWidget(
      EventListScope(
        controller: controller,
        child: MaterialApp(
          home: Scaffold(
            body: SaveReviewConfiguration(
              provider: provider(),
              package: preparationPackage({
                ..._packageChanges,
                if (v2) ...{
                  'sharedContractVersion': 2,
                  'revision': 7,
                  'foodChoiceGroups': [
                    {
                      'id': 'main',
                      'title': 'Main',
                      'selectionCount': 1,
                      'options': [
                        {'id': 'fish', 'name': 'Fish'},
                        {'id': 'rice', 'name': 'Rice'},
                      ],
                    },
                  ],
                },
              }),
              data: data(v2: v2),
              isAuthorized: () => authorized,
            ),
          ),
        ),
      ),
    );
    await settle(tester);
  }

  test(
    'projects complete V2 metadata, selections, canonical time and display estimate',
    () {
      final package = preparationPackage({
        ..._packageChanges,
        'sharedContractVersion': 2,
        'revision': 7,
        'foodChoiceGroups': [
          {
            'id': 'main',
            'title': 'Main',
            'selectionCount': 1,
            'options': [
              {'id': 'fish', 'name': 'Fish'},
              {'id': 'rice', 'name': 'Rice'},
            ],
          },
        ],
      });
      final entry = reviewEventListEntry(
        provider: provider(),
        package: package,
        data: snapshotCustomization(data(v2: true)),
      );
      final config = entry.configuration!;
      expect(config.sharedContractVersion, 2);
      expect(config.expectedPackageRevision, 7);
      expect(config.foodChoiceSelections.single.optionIds, ['fish']);
      expect(config.event.eventTime, '14:00');
      expect(config.event.eventEndTime, '18:00');
      expect(config.customTheme, 'Rustic lights');
      expect(config.themeChoice, 'custom');
      expect(config.packageThemeId, 'garden');
      expect(config.serviceTier, 'full_service');
      expect(config.selectedDecorations, ['Flowers']);
      expect(config.selectedFurniture, ['Tables']);
      expect(config.estimatedTotal, 5500);
      expect(config.pricingContext!.displayedServicePrice, 100);
      expect(config.selectedAddOns.single.addonId, 'music');
      expect(config.toJson().toString(), isNot(contains('bookingToken')));
    },
  );
  for (final guest in [false]) {
    scenario('verified save and downgrade protection; guest=$guest', (
      tester,
    ) async {
      if (guest) {
        auth.guest = true;
        auth.switchTo(null);
        signedOut = true;
      }
      await open(tester);
      await tester.tap(find.text('Add to Event List'));
      await settle(tester);
      expect(
        find.text('Already in Event List'),
        findsOneWidget,
        reason: tester
            .widgetList<Text>(find.byType(Text))
            .map((t) => t.data)
            .join(' | '),
      );
      expect(
        controller.list!.entries.single.readiness,
        CustomerEventListReadiness.configuredRevalidationRequired,
      );
      final saved = controller.list!.entries.single;
      expect(saved.configuration!.event.specialRequest, 'No peanuts');
      expect(
        controller.list!.ownerUid,
        guest ? EventListStore.guestOwnerUid : 'customer_A',
      );
      final writes = memory.writes;
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull,
      );
      expect(memory.writes, writes);
      final reference = CustomerEventListEntry(
        providerId: saved.providerId,
        packageId: saved.packageId,
        providerName: saved.providerName,
        packageName: saved.packageName,
      );
      expect(await controller.addPackage(reference), EventListResult.saved);
      expect(
        controller.list!.entries.single.configuration!.toJson(),
        saved.configuration!.toJson(),
      );
      final updated = reviewEventListEntry(
        provider: provider(),
        package: preparationPackage(_packageChanges),
        data: data(notes: 'Updated request'),
      );
      expect(await controller.addPackage(updated), EventListResult.saved);
      expect(controller.list!.entries, hasLength(1));
      expect(
        controller.list!.entries.single.configuration!.event.specialRequest,
        'Updated request',
      );
      if (guest) {
        expect(memory.values.containsKey(store.key('customer_A')), false);
      }
      await settle(tester);
      await tester.pumpWidget(const SizedBox());
      await settle(tester);
    });
  }
  scenario('V2 save persists revision, dish IDs and theme fields', (
    tester,
  ) async {
    await open(tester, v2: true);
    await tester.tap(find.text('Add to Event List'));
    await settle(tester);
    final saved = controller.list!.entries.single.configuration!;
    expect(saved.sharedContractVersion, 2);
    expect(saved.expectedPackageRevision, 7);
    expect(saved.foodChoiceSelections.single.optionIds, ['fish']);
    expect(saved.packageThemeId, 'garden');
    expect(saved.themeChoice, 'custom');
    expect(saved.customTheme, 'Rustic lights');
    expect(saved.estimatedTotal, 5500);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
  for (final mismatch in [false, true]) {
    scenario('failure feedback and retry; read-back mismatch=$mismatch', (
      tester,
    ) async {
      await open(tester);
      memory.failWrite = !mismatch;
      memory.mismatch = mismatch;
      await tester.tap(find.text('Add to Event List'));
      await settle(tester);
      expect(
        find.textContaining('Could not verify'),
        findsOneWidget,
        reason: tester
            .widgetList<Text>(find.byType(Text))
            .map((t) => t.data)
            .join(' | '),
      );
      expect(find.textContaining('Saved to Event List.'), findsNothing);
      expect(controller.list!.entries, isEmpty);
      memory.failWrite = false;
      memory.mismatch = false;
      await tester.tap(find.text('Retry loading Event List'));
      await settle(tester);
      await tester.tap(find.text('Add to Event List'));
      await settle(tester);
      expect(
        find.text('Already in Event List'),
        findsOneWidget,
        reason: tester
            .widgetList<Text>(find.byType(Text))
            .map((t) => t.data)
            .join(' | '),
      );
      await settle(tester);
      await tester.pumpWidget(const SizedBox());
      await settle(tester);
    });
  }
  scenario(
    'duplicate callbacks do not queue conflicting writes; success waits for verification',
    (tester) async {
      await open(tester);
      memory.writeGate = Completer<void>();
      memory.enteredWrite = Completer<void>();
      final callback = tester
          .widget<OutlinedButton>(find.byType(OutlinedButton))
          .onPressed!;
      callback();
      callback();
      await settle(tester);
      expect(memory.enteredWrite!.isCompleted, true);
      expect(memory.writes, 0);
      expect(find.textContaining('Saved to Event List.'), findsNothing);
      memory.writeGate!.complete();
      await settle(tester);
      expect(memory.writes, 1);
      expect(controller.list!.entries, hasLength(1));
      await settle(tester);
      await tester.pumpWidget(const SizedBox());
      await settle(tester);
    },
  );
  scenario('signed-in unauthorized account cannot use guest storage', (
    tester,
  ) async {
    auth.guest = true;
    auth.switchTo(null);
    signedOut = false;
    await open(tester);
    expect(
      tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
      isNull,
    );
    expect(memory.writes, 0);
    expect(memory.values, isEmpty);
    expect(
      find.textContaining('Sign in with a customer account'),
      findsOneWidget,
      reason: tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.data)
          .join(' | '),
    );
    await settle(tester);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
  for (final accountSwitch in [false, true]) {
    scenario(
      'queued save is blocked on authorization change; account=$accountSwitch',
      (tester) async {
        await open(tester);
        memory.readGate = Completer<void>();
        memory.enteredRead = Completer<void>();
        await tester.tap(find.text('Add to Event List'));
        await settle(tester);
        expect(memory.enteredRead!.isCompleted, true);
        if (accountSwitch) {
          auth.switchTo('customer_B');
        } else {
          authorized = false;
        }
        memory.readGate!.complete();
        await settle(tester);
        expect(memory.writes, 0);
        expect(find.textContaining('Saved to Event List.'), findsNothing);
        await settle(tester);
        await tester.pumpWidget(const SizedBox());
        await settle(tester);
      },
    );
  }
  testWidgets(
    'save UI: customer/guest, failures, duplicate taps, session guards and downgrade scenarios',
    (tester) async {
      for (var i = 0; i < scenarios.length; i++) {
        if (i > 0) {
          controller.dispose();
          auth.dispose();
          await resetFixture();
        }
        debugPrint('Save scenario: ${scenarios[i].$1}');
        await scenarios[i].$2(tester);
      }
    },
  );
}
