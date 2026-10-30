import 'dart:convert';
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
    await openStep(tester, '3');
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
    await tester.tap(find.text('Review Event'));
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
