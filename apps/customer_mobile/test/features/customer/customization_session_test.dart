import 'dart:convert';
import 'package:feasta/features/customer/widgets/package_option_cards.dart';
import 'package:feasta/shared/models/provider_calendar_month.dart';
import 'package:feasta/app/app.dart';
import 'package:feasta/core/security/customer_session_coordinator.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import '../authentication/customer_auth_controller_test.dart'
    show FakeCustomerAuthStateRepository, identity;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feasta/features/customer/location_picker_screen.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/customization_session.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'package:feasta/features/customer/manual_address_screen.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'booking_preparation_flow_test.dart'
    show PreparationAuth, PreparationRepository, seedDraft, openStep, phone;
import 'booking_preparation_test.dart' show preparationPackage;
import 'provider_discovery_test.dart' show provider, GuestAuth;
import 'event_draft_persistence_test.dart' show DraftStore;
import 'customer_event_list_test.dart' show EventAuth;

class GatedDraftStore extends DraftStore {
  Completer<void>? readGate;
  @override
  Future<String?> read(String key) async {
    final result = values[key];
    await readGate?.future;
    return result;
  }
}

class GatedRepository extends PreparationRepository {
  Completer<ProviderCalendarMonth>? calendarGate;
  String? calendarState;
  bool calendarFails = false;
  @override
  Future<ProviderCalendarMonth> getProviderCalendarMonth(
    String p,
    String m,
  ) async {
    if (calendarGate != null) return calendarGate!.future;
    if (calendarFails) throw StateError('offline');
    final date = calendarDateKey(DateTime.now().add(const Duration(days: 30)));
    return ProviderCalendarMonth.parse({
      'month': m,
      'dates': [
        if (calendarState != null) {'date': date, 'state': calendarState},
      ],
    }, m);
  }

  Completer<PackageModel?>? packageGate;
  Completer<AddonModel?>? addonGate;
  @override
  Future<PackageModel?> getEligiblePackageForPreparation(String p, String k) =>
      packageGate?.future ?? super.getEligiblePackageForPreparation(p, k);
  @override
  Future<AddonModel?> getEligiblePreparationAddon(String id) =>
      addonGate?.future ?? super.getEligiblePreparationAddon(id);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  late EventAuth auth;
  late CustomizationSession session;
  late GatedDraftStore store;
  late GatedRepository repo;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    GuestAuth.signedIn = true;
    PreparationAuth.owner = 'customer-1';
    auth = EventAuth()..switchTo('customer-1');
    final captured = auth.session;
    session = CustomizationSession(
      uid: 'customer-1',
      generation: captured.generation,
      changes: auth,
      isCurrent: () => auth.session == captured,
    );
    store = GatedDraftStore();
    repo = GatedRepository();
    eventDraftPersistence = EventDraftPersistence(store);
  });
  tearDown(() {
    session.dispose();
    auth.dispose();
    GuestAuth.signedIn = false;
  });
  Future<void> show(WidgetTester tester, {PackageModel? package}) async {
    phone(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: EventCustomizationScreen(
          provider: provider(),
          eventPackage: package ?? preparationPackage(),
          repository: repo,
          session: session,
        ),
      ),
    );
    await tester.pump();
  }

  void replaceSession() {
    auth.switchTo('customer-1', newSession: true);
  }

  for (final state in ['booked', 'on_hold', 'unavailable', 'offline']) {
    testWidgets('restored $state date remains for review and cannot advance', (
      tester,
    ) async {
      await seedDraft();
      repo.calendarState = state == 'offline' ? null : state;
      repo.calendarFails = state == 'offline';
      await show(tester);
      await tester.pumpAndSettle();
      final restored =
          (tester.state(find.byType(EventCustomizationScreen)) as dynamic)
                  .selectedDate
              as DateTime;
      expect(
        calendarDateKey(restored),
        calendarDateKey(DateTime.now().add(const Duration(days: 30))),
      );
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<CustomizationProgress>(find.byType(CustomizationProgress))
            .step,
        0,
      );
      expect(
        (tester.state(find.byType(EventCustomizationScreen)) as dynamic)
            .selectedDate,
        restored,
      );
      expect(
        find.textContaining(
          state == 'offline'
              ? 'could not be verified'
              : 'Choose another available date',
        ),
        findsOneWidget,
      );
      expect(find.byType(BookingSummaryScreen), findsNothing);
    });
  }

  testWidgets('session replacement during calendar check cannot advance', (
    tester,
  ) async {
    await seedDraft();
    await show(tester);
    await tester.pumpAndSettle();
    repo.calendarGate = Completer<ProviderCalendarMonth>();
    await tester.tap(find.text('Continue'));
    await tester.pump();
    replaceSession();
    final key = calendarDateKey(
      DateTime.now().add(const Duration(days: 30)),
    ).substring(0, 7);
    repo.calendarGate!.complete(
      ProviderCalendarMonth.parse({'month': key, 'dates': []}, key),
    );
    await tester.pumpAndSettle();
    expect(find.byType(BookingSummaryScreen), findsNothing);
    expect(find.textContaining('Please sign in again'), findsOneWidget);
  });

  testWidgets('draft owner mismatch blocks an otherwise authorized entry', (
    tester,
  ) async {
    await seedDraft();
    final before = Map<String, String>.from(store.values);
    PreparationAuth.owner = 'another-customer';
    await show(tester);
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.textContaining('Please sign in again'), findsOneWidget);
    expect(store.values, before);
    expect(store.writes, 1);
  });

  testWidgets('screenshot focus and background return preserve entry and draft', (
    tester,
  ) async {
    phone(tester);
    final repository = FakeCustomerAuthStateRepository();
    final sessions = CustomerSessionCoordinator();
    final controller = CustomerAuthenticationController(
      repository: repository,
      sessions: sessions,
    );
    await tester.pumpWidget(FeastaApp(authenticationController: controller));
    repository.emitAuth(identity);
    await tester.pumpAndSettle();
    PreparationAuth.owner = identity.uid;
    await seedDraft();
    final seeded =
        store.values[eventDraftPersistence.key(
          'customer-1',
          'caterer-1',
          'package-1',
        )]!;
    store.values[eventDraftPersistence.key(
      identity.uid,
      'caterer-1',
      'package-1',
    )] = seeded.replaceAll(
      'customer-1',
      identity.uid,
    );
    final captured = sessions.readSnapshot();
    session.dispose();
    session = CustomizationSession(
      uid: identity.uid,
      generation: captured.generation,
      changes: sessions,
      isCurrent: () => sessions.isCurrent(captured),
    );
    await tester.pumpWidget(
      Stack(
        alignment: Alignment.topLeft,
        children: [
          Offstage(child: FeastaApp(authenticationController: controller)),
          MaterialApp(
            home: EventCustomizationScreen(
              provider: provider(),
              eventPackage: preparationPackage(),
              repository: repo,
              session: session,
            ),
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();
    await openStep(tester, '1');
    final field = find.byWidgetPredicate(
      (w) =>
          w is TextField &&
          w.decoration?.hintText ==
              'Example: Please prepare a small vegetarian option for 5 guests.',
    );
    await tester.scrollUntilVisible(
      field,
      150,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(field, 'Keep my screenshot draft');
    for (final state in [
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(state);
      await tester.pump();
      expect(session.authorized, isTrue);
    }
    await tester.pumpAndSettle();
    expect(sessions.isCurrent(captured), isTrue);
    expect(repository.loadCount, greaterThan(1));
    expect(find.textContaining('Please sign in again'), findsNothing);
    expect(find.text('Keep my screenshot draft'), findsOneWidget);
    expect(
      store.values.values.any((v) => v.contains('Keep my screenshot draft')),
      isTrue,
    );
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
    session.dispose();
    // tearDown owns the replacement session.
    session = CustomizationSession(
      uid: 'closed',
      generation: 0,
      changes: auth,
      isCurrent: () => false,
    );
    sessions.dispose();
    await repository.close();
  });

  for (final failure in [false, true]) {
    testWidgets(
      'old generation draft read ${failure ? 'error' : 'completion'} is suppressed',
      (tester) async {
        await seedDraft();
        final before = Map<String, String>.from(store.values);
        final gate = Completer<void>();
        store.readGate = gate;
        await show(tester);
        replaceSession();
        if (failure) {
          gate.completeError(StateError('old'));
        } else {
          gate.complete();
        }
        await tester.pumpAndSettle();
        expect(find.textContaining('Please sign in again'), findsOneWidget);
        expect(find.textContaining('Unfinished draft recovered'), findsNothing);
        expect(
          find.textContaining('could not be safely recovered'),
          findsNothing,
        );
        expect(store.values, before);
        expect(store.writes, 1);
        expect(repo.validations, 0);
      },
    );
  }
  testWidgets('old package recovery response cannot publish or autosave', (
    tester,
  ) async {
    await seedDraft();
    final gate = Completer<PackageModel?>();
    repo.packageGate = gate;
    await show(tester);
    replaceSession();
    gate.complete(preparationPackage());
    await tester.pumpAndSettle();
    expect(find.textContaining('Unfinished draft recovered'), findsNothing);
    expect(store.writes, 1);
  });
  testWidgets('pending text edit autosave is cancelled on same UID generation', (
    tester,
  ) async {
    await seedDraft();
    await show(tester);
    await tester.pumpAndSettle();
    expect(store.writes, 1);
    await openStep(tester, '1');
    final field = find.byWidgetPredicate(
      (w) =>
          w is TextField &&
          w.decoration?.hintText ==
              'Example: Please prepare a small vegetarian option for 5 guests.',
    );
    await tester.scrollUntilVisible(
      field,
      150,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(field);
    await tester.pumpAndSettle();
    final before = store.writes;
    await tester.enterText(field, 'old session edit');
    replaceSession();
    await tester.pumpAndSettle();
    expect(store.writes, before);
    expect(find.textContaining('Please sign in again'), findsOneWidget);
    expect(session.authorized, isFalse);
  });
  testWidgets('manual picker result is rejected after same UID replacement', (
    tester,
  ) async {
    await show(tester);
    await tester.pumpAndSettle();
    // Invoke the existing manual-address action after scrolling it into view.
    final action = find.text('Enter address manually');
    await tester.scrollUntilVisible(
      action,
      150,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(action);
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.byType(ManualAddressScreen), findsOneWidget);
    replaceSession();
    Navigator.of(tester.element(find.byType(ManualAddressScreen))).pop();
    await tester.pumpAndSettle();
    expect(find.textContaining('Please sign in again'), findsOneWidget);
    expect(store.writes, 0);
  });
  testWidgets('old generation review lookup cannot navigate', (tester) async {
    await seedDraft();
    await show(tester);
    await tester.pumpAndSettle();
    await openStep(tester, '3');
    final gate = Completer<PackageModel?>();
    repo.packageGate = gate;
    await tester.tap(find.text('Review booking'));
    await tester.pump();
    replaceSession();
    gate.complete(preparationPackage());
    await tester.pumpAndSettle();
    expect(find.byType(BookingSummaryScreen), findsNothing);
    expect(find.textContaining('Please sign in again'), findsOneWidget);
    expect(repo.unexpected, isEmpty);
  });
  testWidgets('old add-on recovery response cannot publish', (tester) async {
    await seedDraft();
    final key = eventDraftPersistence.key(
      'customer-1',
      'caterer-1',
      'package-1',
    );
    final record = jsonDecode(store.values[key]!) as Map<String, dynamic>;
    (record['form'] as Map)['addons'] = [
      {
        'addonId': 'addon-1',
        'providerId': 'caterer-1',
        'source': 'catering_provider',
      },
    ];
    store.values[key] = jsonEncode(record);
    final before = store.values[key];
    final gate = Completer<AddonModel?>();
    repo.addonGate = gate;
    await show(tester);
    replaceSession();
    gate.complete(null);
    await tester.pumpAndSettle();
    expect(find.textContaining('Unfinished draft recovered'), findsNothing);
    expect(store.values[key], before);
    expect(store.writes, 1);
  });
  testWidgets('Maps result cannot cross entry generation', (tester) async {
    await show(tester);
    await tester.pumpAndSettle();
    final action = find.text('Choose on Map');
    await tester.scrollUntilVisible(
      action,
      100,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(action);
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.byType(LocationPickerScreen), findsOneWidget);
    replaceSession();
    Navigator.of(tester.element(find.byType(LocationPickerScreen))).pop(
      CustomerAddressModel.defaultOrmoc.copyWith(fullAddress: 'Old map venue'),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Please sign in again'), findsOneWidget);
    expect(find.text('Old map venue'), findsNothing);
    expect(store.writes, 0);
  });
  testWidgets(
    'valid session recovers fixed package without an initialization write',
    (tester) async {
      await seedDraft();
      final before = Map<String, String>.from(store.values);
      await show(
        tester,
        package: preparationPackage({'isCustomizable': false}),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Unfinished draft recovered'), findsOneWidget);
      expect(store.values, before);
      expect(store.writes, 1);
    },
  );
  testWidgets(
    'disposing bound route rejects pending restoration and closes entry',
    (tester) async {
      await seedDraft();
      final before = Map<String, String>.from(store.values);
      final gate = Completer<void>();
      store.readGate = gate;
      await show(tester);
      await tester.pumpWidget(const SizedBox());
      expect(session.authorized, isFalse);
      gate.complete();
      await tester.pumpAndSettle();
      expect(store.values, before);
      expect(store.writes, 1);
      expect(tester.takeException(), isNull);
    },
  );
}
