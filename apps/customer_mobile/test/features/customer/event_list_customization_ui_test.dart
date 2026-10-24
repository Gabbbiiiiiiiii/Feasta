import 'dart:async';
import 'dart:ui' show Tristate;
import 'package:flutter/semantics.dart';
import 'package:feasta/features/customer/package_details_screen.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/customer_event_list_screen.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/event_list_catalog.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'customer_event_list_test.dart' show EventAuth, MemoryEventStorage;
import 'event_list_catalog_test.dart' show saved;
import 'provider_discovery_test.dart' show provider, GuestAuth;
import 'booking_preparation_test.dart' show preparationPackage;
import 'booking_preparation_flow_test.dart'
    show
        PreparationRepository,
        PreparationAuth,
        seedDraft,
        openStep,
        readyPreparationSessions;
import 'event_draft_persistence_test.dart' show DraftStore, form;

class HandoffRepository extends PreparationRepository {
  Completer<PackageModel?>? gate;
  @override
  Future<PackageModel?> getEligiblePackageForPreparation(String p, String k) =>
      gate?.future ?? super.getEligiblePackageForPreparation(p, k);
  @override
  Future<ProviderModel?> getProviderById(String id) async => provider();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  late EventAuth auth;
  late EventListController list;
  late MemoryEventStorage memory;
  late HandoffRepository repo;
  late DraftStore drafts;
  void reset() {
    GuestAuth.signedIn = true;
    PreparationAuth.owner = 'customer-1';
    auth = EventAuth()..switchTo('customer-1');
    memory = MemoryEventStorage();
    list = EventListController(
      store: EventListStore(storage: memory),
      authentication: auth,
    );
    repo = HandoffRepository();
    drafts = DraftStore();
    eventDraftPersistence = EventDraftPersistence(drafts);
  }

  final scenarios = <String, Future<void> Function(WidgetTester)>{};
  void scenario(String name, Future<void> Function(WidgetTester) body) {
    scenarios[name] = body;
  }

  Future<void> show(WidgetTester tester, {TargetPlatform? platform}) async {
    await list.addPackage(saved());
    await tester.pumpWidget(
      EventListScope(
        controller: list,
        child: MaterialApp(
          theme: ThemeData(platform: platform),
          home: CustomerEventListScreen(
            repository: repo,
            catalog: EventListCatalog(lookup: (_, _) async => null),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Customize Package').first, 100);
    await tester.ensureVisible(find.text('Customize Package').first);
    await tester.pumpAndSettle();
  }

  scenario('Phase 3 unavailable cannot authorize or prevent fresh handoff', (
    tester,
  ) async {
    await show(tester);
    final before = Map<String, String>.from(memory.values);
    await tester.tap(find.text('Customize Package'));
    await tester.pumpAndSettle();
    final destination = tester.widget<EventCustomizationScreen>(
      find.byType(EventCustomizationScreen),
    );
    expect(destination.eventPackage.name, 'Celebration');
    expect(destination.provider.businessName, 'Ana Catering');
    expect(destination.initialServiceTier, isNull);
    expect(destination.session!.authorized, isTrue);
    expect(memory.values, before);
    Navigator.of(tester.element(find.byType(EventCustomizationScreen))).pop();
    await tester.pumpAndSettle();
    expect(find.byType(EventCustomizationScreen), findsNothing);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Customize Package'),
          )
          .onPressed,
      isNotNull,
    );
    expect(repo.unexpected, isEmpty);
  });
  for (final action in [
    'remove',
    'clear',
    'failed remove',
    'failed clear',
    'cancel clear',
    'parent route',
  ]) {
    scenario('pending handoff: $action mutation intent', (tester) async {
      final gate = Completer<PackageModel?>();
      repo.gate = gate;
      await show(tester);
      await tester.tap(find.text('Customize Package'));
      await tester.pump();
      expect(find.text('Checking current package\u2026'), findsOneWidget);
      if (action == 'parent route') {
        final navigator = Navigator.of(
          tester.element(find.byType(CustomerEventListScreen)),
        );
        navigator.push<void>(
          MaterialPageRoute(
            builder: (_) => const Scaffold(body: Text('Other route')),
          ),
        );
        await tester.pump(const Duration(milliseconds: 400));
        navigator.pop();
        await tester.pump(const Duration(milliseconds: 400));
      } else if (action.contains('remove')) {
        memory.failWrite = action == 'failed remove';
        final remove = find.text('Remove Saved package');
        await tester.ensureVisible(remove);
        await tester.pump();
        await tester.tap(remove);
        await tester.pumpAndSettle();
      } else {
        memory.failWrite = action == 'failed clear';
        await tester.ensureVisible(find.text('Clear List'));
        await tester.pump();
        await tester.tap(find.text('Clear List'));
        await tester.pump(const Duration(milliseconds: 400));
        await tester.tap(
          find.text(action == 'cancel clear' ? 'Cancel' : 'Confirm Clear List'),
        );
        await tester.pump(const Duration(milliseconds: 400));
      }
      gate.complete(preparationPackage());
      await tester.pumpAndSettle();
      expect(
        find.byType(EventCustomizationScreen),
        action == 'cancel clear' ? findsOneWidget : findsNothing,
      );
      if (action == 'failed remove' ||
          action == 'failed clear' ||
          action == 'cancel clear' ||
          action == 'parent route') {
        expect(list.list!.entries, hasLength(1));
      } else {
        expect(list.list!.entries, isEmpty);
      }
      if (action == 'failed clear') {
        repo.gate = null;
        await tester.ensureVisible(find.text('Customize Package'));
        await tester.tap(find.text('Customize Package'));
        await tester.pumpAndSettle();
        expect(find.byType(EventCustomizationScreen), findsOneWidget);
      }
    });
  }

  Future<void> openCustomization(WidgetTester tester) async {
    await show(tester);
    await tester.tap(find.text('Customize Package'));
    await tester.pumpAndSettle();
  }

  Finder cityField() => find.byWidgetPredicate(
    (w) => w is TextField && w.controller?.text.startsWith('Ormoc') == true,
  );

  Future<void> edit(WidgetTester tester, String value) async {
    await tester.scrollUntilVisible(
      cityField(),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(cityField());
    await tester.enterText(cityField(), value);
    await tester.pump();
  }

  NavigatorState navigator(WidgetTester tester) =>
      Navigator.of(tester.element(find.byType(EventCustomizationScreen)));

  scenario(
    'immediate system Back persists and reopens without duplicate recovery write',
    (tester) async {
      await openCustomization(tester);
      expect(drafts.writes, 0);
      await edit(tester, 'Ormoc latest');
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsNothing);
      expect(drafts.writes, 1);
      await tester.ensureVisible(find.text('Customize Package').first);
      await tester.tap(find.text('Customize Package'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        cityField(),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester.widget<TextField>(cityField()).controller!.text,
        'Ormoc latest',
      );
      navigator(tester).pop();
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsNothing);
      expect(drafts.writes, 1);
    },
  );

  scenario(
    'imperative rapid Back waits for older write and latest queued snapshot',
    (tester) async {
      final semantics = tester.ensureSemantics();
      await openCustomization(tester);
      final nav = navigator(tester);
      final gate = Completer<void>();
      drafts.gate = gate;
      await edit(tester, 'Ormoc older');
      await tester.pump(const Duration(milliseconds: 351));
      await edit(tester, 'Ormoc newest');
      nav.pop();
      nav.pop();
      await tester.pump();
      await tester.pump();
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      final progress = tester.getSemantics(
        find.bySemanticsLabel('Saving unfinished draft before leaving'),
      );
      expect(progress.getSemanticsData().flagsCollection.isLiveRegion, isTrue);
      expect(drafts.writes, 0);
      gate.complete();
      await tester.pumpAndSettle();
      expect(find.byType(CustomerEventListScreen), findsOneWidget);
      expect(find.byType(EventCustomizationScreen), findsNothing);
      expect(drafts.writes, 2);
      final saved = await eventDraftPersistence.read(
        'customer-1',
        'caterer-1',
        'package-1',
      );
      expect(saved!['city'], 'Ormoc newest');
      semantics.dispose();
    },
  );

  scenario(
    'save failure keeps form and accessible retry until storage confirms',
    (tester) async {
      final semantics = tester.ensureSemantics();
      await openCustomization(tester);
      drafts.fail = true;
      await edit(tester, 'Ormoc retry');
      navigator(tester).pop();
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      expect(drafts.writes, 0);
      final feedback = tester
          .getSemantics(
            find.bySemanticsLabel(RegExp('Draft could not be saved.*')),
          )
          .getSemanticsData();
      expect(feedback.flagsCollection.isLiveRegion, isTrue);
      await tester.ensureVisible(find.text('Retry saving and leave'));
      await tester.pump();
      final retry = tester
          .getSemantics(find.text('Retry saving and leave'))
          .getSemanticsData();
      expect(retry.flagsCollection.isButton, isTrue);
      expect(retry.hasAction(SemanticsAction.tap), isTrue);
      await tester.scrollUntilVisible(
        cityField(),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester.widget<TextField>(cityField()).controller!.text,
        'Ormoc retry',
      );
      tester
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await tester.pump();
      drafts.fail = false;
      await tester.tap(find.text('Retry saving and leave'));
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsNothing);
      expect(drafts.writes, 1);
      semantics.dispose();
    },
  );

  scenario('same UID replacement rejects queued write before dispatch', (
    tester,
  ) async {
    await openCustomization(tester);
    final gate = Completer<void>();
    drafts.gate = gate;
    final older = eventDraftPersistence.save(
      'customer-1',
      'other',
      'other',
      form(),
      () => 'customer-1',
    );
    await tester.pump();
    await edit(tester, 'Ormoc stale');
    navigator(tester).pop();
    await tester.pump();
    auth.switchTo(null);
    auth.switchTo('customer-1');
    await tester.pump();
    gate.complete();
    await older;
    await tester.pumpAndSettle();
    expect(drafts.writes, 1);
    expect(
      drafts.values.containsKey(
        eventDraftPersistence.key('customer-1', 'caterer-1', 'package-1'),
      ),
      isFalse,
    );
    expect(
      find.text('Please sign in again to customize your event.'),
      findsOneWidget,
    );
    navigator(tester).popUntil((route) => route.isFirst);
    await tester.pumpAndSettle();
    expect(find.byType(EventCustomizationScreen), findsNothing);
  });

  scenario('untouched Back does not create draft', (tester) async {
    await openCustomization(tester);
    navigator(tester).pop();
    await tester.pumpAndSettle();
    expect(drafts.writes, 0);
  });

  scenario(
    'lookup completes under Clear confirmation without navigation or mutation',
    (tester) async {
      final gate = Completer<PackageModel?>();
      repo.gate = gate;
      await show(tester);
      await tester.tap(find.text('Customize Package'));
      await tester.pump();
      await tester.ensureVisible(find.text('Clear List'));
      await tester.tap(find.text('Clear List'));
      await tester.pump(const Duration(milliseconds: 400));
      final before = Map<String, String>.of(memory.values);
      gate.complete(preparationPackage());
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.byType(EventCustomizationScreen), findsNothing);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(memory.values, before);
      expect(list.list!.entries, hasLength(1));
      expect(find.byType(EventCustomizationScreen), findsNothing);
    },
  );

  scenario(
    'exit failure cancels pending review and allows a deliberate new review',
    (tester) async {
      await seedDraft();
      await openCustomization(tester);
      await openStep(tester, '3');
      final notes = find.byWidgetPredicate(
        (w) => w is TextField && w.minLines == 4 && w.maxLines == 6,
      );
      await tester.scrollUntilVisible(
        notes,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(notes, 'Preserve while leaving');
      final gate = Completer<PackageModel?>();
      repo.gate = gate;
      drafts.fail = true;
      await tester.tap(find.text('Review Event'));
      await tester.pump();
      navigator(tester).pop();
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      gate.complete(preparationPackage());
      await tester.pumpAndSettle();
      expect(find.byType(BookingSummaryScreen), findsNothing);
      repo.gate = null;
      drafts.fail = false;
      await tester.tap(find.text('Review Event'));
      await tester.pumpAndSettle();
      expect(find.byType(BookingSummaryScreen), findsOneWidget);
      expect(repo.unexpected, isEmpty);
    },
  );

  scenario('dirty iOS edge swipe waits for saving before its eventual exit', (
    tester,
  ) async {
    await show(tester, platform: TargetPlatform.iOS);
    await tester.tap(find.text('Customize Package'));
    await tester.pumpAndSettle();
    await edit(tester, 'Ormoc gesture');
    final gate = Completer<void>();
    drafts.gate = gate;
    await tester.dragFrom(const Offset(0, 300), const Offset(600, 0));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(EventCustomizationScreen), findsOneWidget);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.byType(EventCustomizationScreen), findsNothing);
    expect(drafts.writes, 1);
  });

  scenario('iOS app bar Back is hit and starts the authorized save barrier', (
    tester,
  ) async {
    await show(tester, platform: TargetPlatform.iOS);
    await tester.tap(find.text('Customize Package'));
    await tester.pumpAndSettle();
    final gate = Completer<void>();
    drafts.gate = gate;
    await edit(tester, 'Ormoc app bar');
    final back = find
        .descendant(of: find.byType(AppBar), matching: find.byType(BackButton))
        .hitTestable();
    expect(back, findsOneWidget);
    expect(tester.widget<BackButton>(back).onPressed, isNotNull);
    expect(find.text('Saving unfinished draft before leaving'), findsNothing);
    final previous = WidgetController.hitTestWarningShouldBeFatal;
    WidgetController.hitTestWarningShouldBeFatal = true;
    try {
      await tester.tap(back);
      await tester.pump();
      expect(
        find.text('Saving unfinished draft before leaving'),
        findsOneWidget,
      );
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      expect(drafts.writes, 0);
      gate.complete();
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsNothing);
      expect(drafts.writes, 1);
    } finally {
      WidgetController.hitTestWarningShouldBeFatal = previous;
    }
  });

  scenario(
    'Package Details entry saves on app bar Back and restores unchanged',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: PackageDetailsScreen(
            sessions: readyPreparationSessions(),
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Select Package'));
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      expect(drafts.writes, 0);
      await edit(tester, 'Ormoc details');
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.byType(PackageDetailsScreen), findsOneWidget);
      expect(drafts.writes, 1);
      await tester.tap(find.text('Select Package'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        cityField(),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester.widget<TextField>(cityField()).controller!.text,
        'Ormoc details',
      );
      navigator(tester).pop();
      await tester.pumpAndSettle();
      expect(drafts.writes, 1);
      expect(repo.unexpected, isEmpty);
    },
  );

  scenario('package-specific button, loading, lock and destination semantics', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 3000);
    tester.view.devicePixelRatio = 1;
    final semantics = tester.ensureSemantics();
    await list.addPackage(
      CustomerEventListEntry(
        providerId: 'caterer-1',
        packageId: 'package-2',
        packageName: 'Other package',
        providerName: 'Saved provider',
      ),
    );
    final gate = Completer<PackageModel?>();
    repo.gate = gate;
    await show(tester);
    final action = find.bySemanticsLabel('Customize Package: Saved package');
    final enabled = tester.getSemantics(action).getSemanticsData();
    expect(enabled.flagsCollection.isButton, isTrue);
    expect(enabled.flagsCollection.isEnabled, Tristate.isTrue);
    expect(enabled.hasAction(SemanticsAction.tap), isTrue);
    await tester.tap(action);
    await tester.pump();
    final progress = tester
        .getSemantics(
          find.bySemanticsLabel('Checking current package: Saved package'),
        )
        .getSemanticsData();
    expect(progress.label, 'Checking current package: Saved package');
    expect(progress.flagsCollection.isLiveRegion, isTrue);
    for (final label in ['Saved package', 'Other package']) {
      final disabled = tester
          .getSemantics(find.bySemanticsLabel('Customize Package: $label'))
          .getSemanticsData();
      expect(disabled.flagsCollection.isButton, isTrue);
      expect(disabled.flagsCollection.isEnabled, Tristate.isFalse);
      expect(disabled.hasAction(SemanticsAction.tap), isFalse);
    }
    gate.complete(preparationPackage());
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Customize Event'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('.*Celebration.*')), findsWidgets);
    expect(
      find.bySemanticsLabel('Checking current package: Saved package'),
      findsNothing,
    );
    semantics.dispose();
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  for (final outcome in [
    'unavailable',
    'could not verify',
    'price unavailable',
  ]) {
    scenario('$outcome live feedback disappears on a new deliberate tap', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      final semantics = tester.ensureSemantics();
      await show(tester);
      if (outcome == 'unavailable') repo.current = null;
      if (outcome == 'could not verify') repo.fail = true;
      if (outcome == 'price unavailable') {
        repo.current = preparationPackage({'price': -1});
      }
      await tester.tap(find.text('Customize Package'));
      await tester.pumpAndSettle();
      final label = outcome == 'unavailable'
          ? 'This package is currently unavailable. Your saved selection has been kept.'
          : outcome == 'could not verify'
          ? "We couldn't verify this package. Please try again."
          : 'The latest package price could not be verified. Please try again later.';
      final feedback = tester
          .getSemantics(find.bySemanticsLabel(label))
          .getSemanticsData();
      expect(feedback.label, label);
      expect(feedback.flagsCollection.isLiveRegion, isTrue);
      final gate = Completer<PackageModel?>();
      repo.gate = gate;
      await tester.tap(find.text('Customize Package'));
      await tester.pump();
      expect(find.bySemanticsLabel(label), findsNothing);
      gate.complete(preparationPackage());
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('Customize Event'), findsOneWidget);
      semantics.dispose();
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
  }

  testWidgets(
    'saved package handoff: navigation, persistence and mutation scenarios',
    (tester) async {
      for (final scenario in scenarios.entries) {
        reset();
        try {
          await scenario.value(tester);
          debugPrint('SCENARIO PASS: ${scenario.key}');
          await tester.pumpWidget(const SizedBox());
          await tester.pumpAndSettle();
        } catch (error, stack) {
          fail('${scenario.key}: $error\n$stack');
        } finally {
          list.dispose();
          auth.dispose();
          GuestAuth.signedIn = false;
        }
      }
    },
  );
}
