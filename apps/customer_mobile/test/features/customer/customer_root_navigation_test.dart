import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/app/router/customer_auth_navigation.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'package:feasta/features/customer/package_details_screen.dart';
import 'package:feasta/features/customer/event_list/customer_event_list_screen.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_catalog.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/core/security/customer_session_coordinator.dart';
import 'package:feasta/core/widgets/widgets.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'booking_preparation_flow_test.dart'
    show PreparationAuth, readyPreparationSessions;
import 'booking_preparation_test.dart' show preparationPackage;
import 'customer_event_list_test.dart' show EventAuth, MemoryEventStorage;
import 'event_draft_persistence_test.dart' show DraftStore, form;
import 'event_list_catalog_test.dart' show saved;
import 'event_list_customization_ui_test.dart' show HandoffRepository;
import 'provider_discovery_test.dart' show GuestAuth, provider;

class CountingDraftStore extends DraftStore {
  int attempts = 0;
  @override
  Future<void> write(String key, String value) {
    attempts++;
    return super.write(key, value);
  }
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
  late HandoffRepository repo;
  late CountingDraftStore store;
  late CustomerSessionCoordinator sessions;
  late GlobalKey<NavigatorState> key;
  void reset() {
    GuestAuth.signedIn = true;
    PreparationAuth.owner = 'customer-1';
    auth = EventAuth()..switchTo('customer-1');
    list = EventListController(
      store: EventListStore(storage: MemoryEventStorage()),
      authentication: auth,
    );
    repo = HandoffRepository();
    store = CountingDraftStore();
    eventDraftPersistence = EventDraftPersistence(store);
    sessions = readyPreparationSessions();
    key = GlobalKey<NavigatorState>();
  }

  Future<void> open(
    WidgetTester tester,
    String entry, {
    int expectedWrites = 0,
  }) async {
    tester.view.physicalSize = const Size(800, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await list.addPackage(saved());
    await tester.pumpWidget(
      EventListScope(
        controller: list,
        child: MaterialApp(
          navigatorKey: key,
          home: const Scaffold(body: Text('Persistent root')),
        ),
      ),
    );
    key.currentState!.push<void>(
      MaterialPageRoute(
        builder: (_) => entry == 'Event List'
            ? CustomerEventListScreen(
                repository: repo,
                catalog: EventListCatalog(lookup: (_, _) async => null),
              )
            : PackageDetailsScreen(
                provider: provider(),
                eventPackage: preparationPackage(),
                repository: repo,
                sessions: sessions,
              ),
      ),
    );
    await tester.pumpAndSettle();
    final action = find.text(
      entry == 'Event List' ? 'Customize Package' : 'Select Package',
    );
    await tester.scrollUntilVisible(action, 100);
    await tester.ensureVisible(action);
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.byType(EventCustomizationScreen), findsOneWidget);
    expect(store.attempts, expectedWrites);
  }

  Finder city() => find.byWidgetPredicate(
    (w) => w is TextField && w.controller!.text.startsWith('Ormoc'),
  );
  Future<void> edit(WidgetTester tester, String text) async {
    await tester.scrollUntilVisible(
      city(),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(city());
    await tester.enterText(city(), text);
    await tester.pump();
  }

  final scenarios = <String, Future<void> Function(WidgetTester)>{};
  void navigationTest(String name, Future<void> Function(WidgetTester) body) {
    scenarios[name] = body;
  }

  for (final entry in ['Event List', 'Package Details']) {
    navigationTest('$entry: bulk held save retains latest snapshot and root', (
      tester,
    ) async {
      await open(tester, entry);
      final gate = Completer<void>();
      store.gate = gate;
      await edit(tester, 'Ormoc older');
      await tester.pump(const Duration(milliseconds: 351));
      await edit(tester, 'Ormoc latest');
      var reached = 0;
      final result = returnToCustomerRoot(
        key.currentState!,
        onReached: () => reached++,
      );
      final repeated = returnToCustomerRoot(
        key.currentState!,
        onReached: () => fail('Competing request replaced destination'),
      );
      key.currentState!.pop(); // Back joins the existing root-return intent.
      await tester.pump();
      await tester.pump();
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      expect(reached, 0);
      expect(store.attempts, 1); // Newest snapshot is serialized behind older.
      gate.complete();
      await tester.pumpAndSettle();
      expect(await result, isTrue);
      expect(await repeated, isTrue);
      expect(reached, 1);
      expect(find.text('Persistent root'), findsOneWidget);
      expect(store.attempts, 2);
      final restored = await eventDraftPersistence.read(
        'customer-1',
        'caterer-1',
        'package-1',
      );
      expect(restored!['city'], 'Ormoc latest');
      await open(tester, entry, expectedWrites: 2);
      await tester.scrollUntilVisible(
        city(),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(tester.widget<TextField>(city()).controller!.text, 'Ormoc latest');
      // Recovery does not write the unchanged snapshot.
      expect(store.attempts, 2);
    });

    navigationTest(
      '$entry: failed bulk save keeps accessible Retry and destination',
      (tester) async {
        final semantics = tester.ensureSemantics();
        await open(tester, entry);
        store.fail = true;
        await edit(tester, 'Ormoc retry bulk');
        var reached = 0;
        final result = returnToCustomerRoot(
          key.currentState!,
          onReached: () => reached++,
        );
        await tester.pumpAndSettle();
        expect(await result, isFalse);
        expect(reached, 0);
        expect(store.writes, 0);
        expect(find.byType(EventCustomizationScreen), findsOneWidget);
        final feedback = tester.getSemantics(
          find.bySemanticsLabel(RegExp('Draft could not be saved.*')),
        );
        expect(
          feedback.getSemanticsData().flagsCollection.isLiveRegion,
          isTrue,
        );
        await tester.scrollUntilVisible(
          city(),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        expect(
          tester.widget<TextField>(city()).controller!.text,
          'Ormoc retry bulk',
        );
        store.fail = false;
        tester
            .state<ScrollableState>(find.byType(Scrollable).first)
            .position
            .jumpTo(0);
        await tester.pump();
        await tester.tap(find.text('Retry saving and leave'));
        await tester.pumpAndSettle();
        expect(reached, 1);
        expect(store.writes, 1);
        expect(find.text('Persistent root'), findsOneWidget);
        semantics.dispose();
      },
    );

    navigationTest('$entry: clean bulk exit creates no draft', (tester) async {
      await open(tester, entry);
      final result = returnToCustomerRoot(key.currentState!);
      await tester.pumpAndSettle();
      expect(await result, isTrue);
      expect(store.attempts, 0);
      expect(find.text('Persistent root'), findsOneWidget);
    });

    navigationTest(
      '$entry: same UID invalidation cancels exit and queued write',
      (tester) async {
        await open(tester, entry);
        final gate = Completer<void>();
        store.gate = gate;
        final older = eventDraftPersistence.save(
          'customer-1',
          'other',
          'other',
          form(),
          () => 'customer-1',
        );
        await edit(tester, 'Ormoc old generation');
        var staleDestination = 0;
        final exit = returnToCustomerRoot(
          key.currentState!,
          onReached: () => staleDestination++,
        );
        await tester.pump();
        if (entry == 'Event List') {
          auth.switchTo('customer-1', newSession: true);
        } else {
          sessions.invalidate();
          sessions.completeValidation(
            sessions.beginValidation(),
            validatedUid: 'customer-1',
            authorizedCustomer: true,
          );
        }
        await tester.pump();
        expect(await exit, isFalse); // Completes before held platform write.
        expect(
          find.text('Please sign in again to customize your event.'),
          findsOneWidget,
        );
        // The security exit bypasses the invalid customer's save barrier.
        final securityExit = returnToCustomerRoot(key.currentState!);
        await tester.pumpAndSettle();
        expect(await securityExit, isTrue);
        expect(find.text('Persistent root'), findsOneWidget);
        gate.complete();
        await older;
        await tester.pumpAndSettle();
        expect(store.attempts, 1);
        expect(staleDestination, 0);
        expect(
          store.values.containsKey(
            eventDraftPersistence.key('customer-1', 'caterer-1', 'package-1'),
          ),
          isFalse,
        );
      },
    );

    navigationTest(
      '$entry: binding and entry lock survive pop until completion',
      (tester) async {
        await open(tester, entry);
        final screen = tester.widget<EventCustomizationScreen>(
          find.byType(EventCustomizationScreen),
        );
        final session = screen.session!;
        final route = ModalRoute.of(
          tester.element(find.byType(EventCustomizationScreen)),
        )!;
        var completed = false;
        (route as EventCustomizationRoute).completed.then(
          (_) => completed = true,
        );
        final popped = route.popped;
        key.currentState!.pop();
        await popped;
        expect(completed, isFalse);
        expect(session.authorized, isTrue);
        await tester.pump(const Duration(milliseconds: 30));
        final button = find.widgetWithText(
          FilledButton,
          entry == 'Event List' ? 'Customize Package' : 'Select Package',
          skipOffstage: false,
        );
        // Package Details uses its own primary button type; Event List exposes
        // the actual handoff lock directly in its FilledButton callback.
        if (entry == 'Event List') {
          expect(tester.widget<FilledButton>(button).onPressed, isNull);
        } else {
          expect(
            tester
                .widget<FeastaPrimaryButton>(
                  find.byWidgetPredicate(
                    (w) =>
                        w is FeastaPrimaryButton &&
                        (w.label == 'Select Package' ||
                            w.label == 'Checking package...'),
                    skipOffstage: false,
                  ),
                )
                .onPressed,
            isNull,
          );
        }
        expect(completed, isFalse);
        expect(session.authorized, isTrue);
        await tester.pumpAndSettle();
        expect(completed, isTrue);
        expect(session.authorized, isFalse);
        if (entry == 'Event List') {
          expect(tester.widget<FilledButton>(button).onPressed, isNotNull);
        } else {
          expect(
            tester
                .widget<FeastaPrimaryButton>(
                  find.byWidgetPredicate(
                    (w) =>
                        w is FeastaPrimaryButton &&
                        (w.label == 'Select Package' ||
                            w.label == 'Checking package...'),
                    skipOffstage: false,
                  ),
                )
                .onPressed,
            isNotNull,
          );
        }
        expect(route.permitPop, isNull);
        expect(route.requestExit, isNull);
        expect(store.attempts, 0);
      },
    );
  }

  navigationTest('changed modal stack cancels pending root callback safely', (
    tester,
  ) async {
    await open(tester, 'Event List');
    final gate = Completer<void>();
    store.gate = gate;
    await edit(tester, 'Ormoc modal');
    var reached = 0;
    final exit = returnToCustomerRoot(
      key.currentState!,
      onReached: () => reached++,
    );
    await tester.pump();
    showDialog<void>(
      context: tester.element(find.byType(EventCustomizationScreen)),
      builder: (_) => const AlertDialog(title: Text('New modal')),
    );
    await tester.pump(const Duration(milliseconds: 200));
    gate.complete();
    await tester.pumpAndSettle();
    expect(await exit, isFalse);
    expect(reached, 0);
    expect(find.text('New modal'), findsOneWidget);
    key.currentState!.pop();
    await tester.pumpAndSettle();
    expect(find.byType(EventCustomizationScreen), findsOneWidget);
    expect(store.writes, 1);
  });

  navigationTest(
    'Continue Browsing callback uses production root coordination',
    (tester) async {
      await open(tester, 'Event List');
      final gate = Completer<void>();
      store.gate = gate;
      await edit(tester, 'Ormoc browsing');
      final browse = tester.widget<FilledButton>(
        find.widgetWithText(
          FilledButton,
          'Continue Browsing',
          skipOffstage: false,
        ),
      );
      browse.onPressed!();
      await tester.pump();
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      expect(store.attempts, 1);
      gate.complete();
      await tester.pumpAndSettle();
      expect(find.text('Persistent root'), findsOneWidget);
      expect(store.writes, 1);
    },
  );
  for (final entry in ['Event List', 'Package Details']) {
    navigationTest('$entry: dispatched write stays at original account key', (
      tester,
    ) async {
      await open(tester, entry);
      final gate = Completer<void>();
      store.gate = gate;
      await edit(tester, 'Ormoc dispatched');
      var stale = 0;
      final exit = returnToCustomerRoot(
        key.currentState!,
        onReached: () => stale++,
      );
      await tester.pump();
      expect(store.attempts, 1);
      if (entry == 'Event List') {
        auth.switchTo('customer-2');
      } else {
        sessions.invalidate();
        PreparationAuth.owner = 'customer-2';
        sessions.observeIdentity('customer-2');
        sessions.completeValidation(
          sessions.beginValidation(),
          validatedUid: 'customer-2',
          authorizedCustomer: true,
        );
      }
      await tester.pump();
      expect(await exit, isFalse);
      final security = returnToCustomerRoot(key.currentState!);
      await tester.pumpAndSettle();
      expect(await security, isTrue);
      key.currentState!.push<void>(
        MaterialPageRoute(
          builder: (_) => const Scaffold(body: Text('New session destination')),
        ),
      );
      await tester.pumpAndSettle();
      gate.complete();
      await tester.pumpAndSettle();
      expect(stale, 0);
      expect(find.text('New session destination'), findsOneWidget);
      expect(store.writes, 1);
      expect(store.values.keys, [
        eventDraftPersistence.key('customer-1', 'caterer-1', 'package-1'),
      ]);
    });

    navigationTest(
      '$entry: removed parent rejects deferred root continuation',
      (tester) async {
        await open(tester, entry);
        final route =
            ModalRoute.of(
                  tester.element(find.byType(EventCustomizationScreen)),
                )!
                as EventCustomizationRoute;
        final gate = Completer<void>();
        store.gate = gate;
        await edit(tester, 'Ormoc missing parent');
        var reached = 0;
        final exit = returnToCustomerRoot(
          key.currentState!,
          onReached: () => reached++,
        );
        await tester.pump();
        key.currentState!.removeRoute(route.origin!);
        await tester.pump();
        expect(find.byType(EventCustomizationScreen), findsOneWidget);
        gate.complete();
        await tester.pumpAndSettle();
        expect(await exit, isFalse);
        expect(reached, 0);
        expect(find.byType(EventCustomizationScreen), findsOneWidget);
      },
    );
  }

  navigationTest(
    'existing modal is retained until customization save succeeds',
    (tester) async {
      await open(tester, 'Event List');
      final gate = Completer<void>();
      store.gate = gate;
      await edit(tester, 'Ormoc existing modal');
      showDialog<void>(
        context: tester.element(find.byType(EventCustomizationScreen)),
        builder: (_) => const AlertDialog(title: Text('Existing modal')),
      );
      await tester.pump(const Duration(milliseconds: 200));
      final exit = returnToCustomerRoot(key.currentState!);
      await tester.pump();
      expect(find.text('Existing modal'), findsOneWidget);
      expect(store.writes, 0);
      gate.complete();
      await tester.pumpAndSettle();
      expect(await exit, isTrue);
      expect(find.text('Persistent root'), findsOneWidget);
      expect(store.writes, 1);
    },
  );

  navigationTest(
    'Package Details lookup rejects same UID generation replacement',
    (tester) async {
      final gate = Completer<PackageModel?>();
      repo.gate = gate;
      await tester.pumpWidget(
        MaterialApp(
          home: PackageDetailsScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
            sessions: sessions,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Select Package'));
      await tester.pump();
      sessions.invalidate();
      sessions.completeValidation(
        sessions.beginValidation(),
        validatedUid: 'customer-1',
        authorizedCustomer: true,
      );
      gate.complete(preparationPackage());
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsNothing);
      expect(find.text('Select Package'), findsOneWidget);
      expect(store.attempts, 0);
    },
  );

  testWidgets(
    'root-return navigation: persistence, security and route lifetime',
    (tester) async {
      for (final scenario in scenarios.entries) {
        reset();
        try {
          await scenario.value(tester);
          debugPrint('SCENARIO PASS: ${scenario.key}');
        } catch (error, stack) {
          fail('${scenario.key}: $error\n$stack');
        } finally {
          await tester.pumpWidget(const SizedBox());
          await tester.pumpAndSettle();
          list.dispose();
          auth.dispose();
          GuestAuth.signedIn = false;
        }
      }
    },
  );
}
