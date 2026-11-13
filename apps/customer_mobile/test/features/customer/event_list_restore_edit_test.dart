import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:feasta/features/customer/event_list/customer_event_list_screen.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/event_list_catalog.dart';
import 'package:feasta/features/customer/event_list/event_list_configuration_summary.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'customer_event_list_test.dart' show EventAuth, MemoryEventStorage;
import 'event_list_configuration_codec_test.dart' show configuration;
import 'event_list_customization_ui_test.dart' show HandoffRepository;
import 'booking_preparation_test.dart' show preparationPackage;
import 'booking_preparation_flow_test.dart'
    show PreparationAuth, seedDraft, openStep;
import 'provider_discovery_test.dart' show GuestAuth;
import 'event_draft_persistence_test.dart' show DraftStore;

class _Auth extends EventAuth {
  @override
  bool get guestPlanningAllowed => true;
}

CustomerEventListConfiguration snapshot({bool v2 = false, bool stale = false}) {
  final value = configuration();
  value['event']['eventType'] = v2 ? 'wedding' : 'Wedding';
  value['event']['specialRequest'] = 'No peanuts';
  value['sharedContractVersion'] = v2 ? 2 : null;
  value['expectedPackageRevision'] = v2 ? 7 : null;
  value['foodChoiceSelections'] = v2
      ? [
          {
            'groupId': 'main',
            'optionIds': [stale ? 'removed-dish' : 'fish'],
          },
        ]
      : [];
  value['selectedFoods'] = v2 ? [] : ['Rice'];
  value['selectedAddOns'] = [];
  value['themeChoice'] = 'custom';
  value['customTheme'] = 'Rustic lights';
  return CustomerEventListConfiguration.fromJson(value);
}

PackageModel currentPackage({bool v2 = false}) => preparationPackage({
  'serviceOptions': {
    'full_service': {
      'price': 100,
      'includedServices': ['Staff'],
    },
  },
  'themeOptions': [
    {'id': 'garden', 'name': 'Garden'},
  ],
  'pricingModel': 'per_pax',
  if (v2) ...{
    'sharedContractVersion': 2,
    'revision': 7,
    'occasionMatchIds': ['wedding'],
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
});
CustomerEventListEntry saved({
  bool v2 = false,
  bool stale = false,
  bool complete = true,
  String id = 'package-1',
}) => CustomerEventListEntry(
  providerId: 'caterer-1',
  packageId: id,
  providerName: 'Ana Catering',
  packageName: 'Celebration',
  configuration: complete ? snapshot(v2: v2, stale: stale) : null,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  testWidgets('saved summary uses names and never exposes selection IDs', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: EventListConfigurationSummary(
            entry: saved(v2: true),
            lookupPackage: (_, _) async => currentPackage(v2: true),
          ),
        ),
      ),
    );
    expect(find.text('Configured — revalidation required'), findsOneWidget);
    await tester.tap(find.text('Configuration details'));
    await tester.pumpAndSettle();
    expect(find.text('Food selections: Fish'), findsOneWidget);
    expect(find.text('Theme: Garden'), findsOneWidget);
    expect(find.text('Custom theme request: Rustic lights'), findsOneWidget);
    expect(find.text('Special requests: No peanuts'), findsOneWidget);
    expect(
      tester
          .widgetList<Text>(find.byType(Text))
          .any((t) => t.data?.contains('groupId') == true),
      false,
    );
  });
  testWidgets('legacy package-only summary preserves Needs customization', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: EventListConfigurationSummary(entry: saved(complete: false)),
        ),
      ),
    );
    expect(find.text('Needs customization'), findsOneWidget);
    expect(find.text('Configuration details'), findsNothing);
  });
  testWidgets(
    'customer and guest restore/edit/save, stale correction, identity and entry preservation',
    (tester) async {
      tester.view.physicalSize = const Size(900, 2200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final scenario in [(false, false), (true, false), (false, true)]) {
        final guest = scenario.$1, v2 = scenario.$2;
        GuestAuth.signedIn = !guest;
        PreparationAuth.owner = 'customer-1';
        final auth = _Auth()..switchTo(guest ? null : 'customer-1');
        final storage = MemoryEventStorage();
        final controller = EventListController(
          store: EventListStore(storage: storage),
          authentication: auth,
          signedOutGuest: () => guest,
        );
        final repo = HandoffRepository()..current = currentPackage(v2: v2);
        final drafts = DraftStore();
        eventDraftPersistence = EventDraftPersistence(drafts);
        if (!guest) await seedDraft();
        final unrelated = Map<String, String>.from(drafts.values);
        if (guest) {
          // Legacy guest records remain readable for migration, but new
          // controller additions require an authenticated customer.
          await controller.store.guestAddPackage(
            saved(v2: v2, stale: v2),
            authorize: () {},
          );
          await controller.store.guestAddPackage(
            saved(complete: false, id: 'package-other'),
            authorize: () {},
          );
          await controller.load();
        } else {
          await controller.addPackage(saved(v2: v2, stale: v2));
          await controller.addPackage(
            saved(complete: false, id: 'package-other'),
          );
        }
        await tester.pumpWidget(
          EventListScope(
            controller: controller,
            child: MaterialApp(
              home: CustomerEventListScreen(
                repository: repo,
                catalog: EventListCatalog(lookup: (_, _) async => null),
                bookingEligibilityCheck: (_) async => true,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Needs customization'), findsWidgets);
        await tester.scrollUntilVisible(
          find.text('Edit configuration'),
          150,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(find.text('Edit configuration'));
        await tester.pumpAndSettle();
        expect(find.byType(EventCustomizationScreen), findsOneWidget);
        expect(
          find.textContaining('Event List configuration restored'),
          findsOneWidget,
        );
        final fields = tester
            .widgetList<TextField>(find.byType(TextField))
            .map((f) => f.controller?.text)
            .toList();
        expect(fields, contains('Event hall'));
        expect(fields, contains('100'));
        expect(fields, contains('No peanuts'));
        if (v2) {
          expect(
            find.text('Food-choice groups or dishes require correction.'),
            findsOneWidget,
          );
          expect(
            controller.list!.entries
                .firstWhere((e) => e.packageId == 'package-1')
                .configuration!
                .foodChoiceSelections
                .single
                .optionIds,
            ['removed-dish'],
          );
        }
        final request = find.byWidgetPredicate(
          (widget) =>
              widget is TextField && widget.controller?.text == 'No peanuts',
        );
        await tester.ensureVisible(request);
        await tester.enterText(request, 'Updated request');
        FocusManager.instance.primaryFocus?.unfocus();
        tester.testTextInput.hide();
        await tester.pumpAndSettle();
        final restoreScroll = tester.state<ScrollableState>(
          find.byType(Scrollable).first,
        );
        restoreScroll.position.jumpTo(0);
        await tester.pumpAndSettle();

        final confirmButton = find.widgetWithText(
          OutlinedButton,
          v2
              ? 'Remove unavailable options and review current package'
              : 'Confirm restored options',
        );
        expect(confirmButton, findsOneWidget);
        await tester.tap(confirmButton);
        await tester.pumpAndSettle();
        await openStep(tester, '2 Customize');
        if (v2) {
          final fish = find.text('Fish').first;
          await tester.ensureVisible(fish);
          await tester.tap(fish);
          await tester.pumpAndSettle();
        }
        await tester.tap(find.text('Review booking'));
        await tester.pumpAndSettle();
        expect(find.byType(BookingSummaryScreen), findsOneWidget);
        if (guest) {
          expect(
            find.textContaining('Sign in with a customer account'),
            findsOneWidget,
          );
          expect(
            tester
                .widget<OutlinedButton>(
                  find.widgetWithText(OutlinedButton, 'Update Event List'),
                )
                .onPressed,
            isNull,
          );
          expect(
            controller.list!.entries
                .firstWhere((e) => e.packageId == 'package-1')
                .configuration!
                .event
                .specialRequest,
            'No peanuts',
          );
          await tester.pumpWidget(const SizedBox());
          await tester.pumpAndSettle();
          controller.dispose();
          auth.dispose();
          continue;
        }
        await tester.tap(find.text('Update Event List'));
        await tester.pumpAndSettle();
        expect(find.text('Already in Event List'), findsOneWidget);
        expect(controller.list!.entries, hasLength(2));
        final updated = controller.list!.entries
            .firstWhere((e) => e.packageId == 'package-1')
            .configuration!;
        expect(updated.event.eventAddress, 'Event hall');
        expect(updated.event.specialRequest, startsWith('Updated request'));
        expect(updated.customTheme, 'Rustic lights');
        expect(updated.serviceTier, 'full_service');
        expect(updated.packageThemeId, 'garden');
        expect(updated.estimatedTotal, 10000);
        if (v2) {
          expect(updated.expectedPackageRevision, 7);
          expect(updated.foodChoiceSelections.single.optionIds, ['fish']);
        }
        expect(
          controller.list!.entries
              .firstWhere((e) => e.packageId == 'package-other')
              .configuration,
          isNull,
        );
        for (final entry in unrelated.entries) {
          expect(drafts.values[entry.key], entry.value);
        }
        expect(repo.unexpected, isEmpty);
        await tester.pumpWidget(const SizedBox());
        await tester.pumpAndSettle();
        controller.dispose();
        auth.dispose();
      }
    },
  );
}
