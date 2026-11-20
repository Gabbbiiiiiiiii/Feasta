import 'package:feasta/features/customer/provider_profile_screen.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'booking_preparation_test.dart' show preparationPackage;
import 'booking_preparation_flow_test.dart'
    show PreparationAuth, PreparationRepository, seedDraft, openStep, phone;
import 'provider_discovery_test.dart'
    show provider, GuestAuth, ProfileRepository;
import 'event_draft_persistence_test.dart' show DraftStore;

class _Profile extends ProfileRepository {
  _Profile(this.package);
  final PackageModel package;
  @override
  Stream<List<PackageModel>> packagesByProvider(String id) =>
      Stream.value([package]);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  setUp(() {
    GuestAuth.signedIn = true;
    PreparationAuth.owner = 'customer-1';
    SharedPreferences.setMockInitialValues({});
    eventDraftPersistence = EventDraftPersistence(DraftStore());
  });
  tearDown(() {
    GuestAuth.signedIn = false;
  });
  for (final pricing in ['per_pax', 'per_bundle']) {
    for (final capacity in [null, 0, -1, 50]) {
      testWidgets('profile $pricing capacity $capacity', (tester) async {
        phone(tester);
        GuestAuth.signedIn = false;
        final package = preparationPackage({
          'guestCapacity': capacity,
          'pricingModel': pricing,
        });
        await tester.pumpWidget(
          MaterialApp(
            home: ProviderProfileScreen(
              provider: provider(),
              repository: _Profile(package),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text(package.name),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        expect(
          find.text(
            capacity == 50 ? 'Good for 50 guests' : 'Capacity not published',
          ),
          findsOneWidget,
        );
        expect(
          find.text(pricing == 'per_pax' ? 'Per guest' : 'Fixed bundle'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets('published price distinguished from selected Full-Service tier', (
    tester,
  ) async {
    phone(tester);
    final package = preparationPackage({
      'price': 450,
      'pricingModel': 'per_pax',
      'serviceOptions': {
        'drop_off': {'price': 450, 'title': 'Drop-Off'},
        'full_service': {'price': 650, 'title': 'Full-Service'},
      },
    });
    await tester.pumpWidget(
      MaterialApp(
        home: EventCustomizationScreen(
          provider: provider(),
          eventPackage: package,
          initialServiceTier: 'full_service',
          repository: PreparationRepository()..current = package,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.textContaining('Published price'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text('Published price (before tier choice): ₱450.00'),
      findsOneWidget,
      reason: tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.data)
          .join(' | '),
    );
    expect(find.text('\u20b132,500.00'), findsWidgets);
    expect(find.textContaining('starting'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  for (final scenario in [
    'empty',
    'unavailable',
    'inactive',
    'other provider',
    'available',
  ]) {
    final available = scenario == 'available';
    testWidgets('provider add-ons availability $scenario', (tester) async {
      phone(tester);
      await seedDraft();
      final repo = PreparationRepository()
        ..addons = scenario == 'empty'
            ? []
            : [
                AddonModel(
                  id: 'addon-1',
                  providerId: scenario == 'other provider'
                      ? 'other'
                      : 'caterer-1',
                  name: 'Extra service',
                  description: '',
                  category: 'other',
                  price: 100,
                  isAvailable: scenario != 'unavailable',
                  isActive: scenario != 'inactive',
                  providerBusinessName: 'Provider',
                  providerType: 'catering',
                ),
              ];
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await openStep(tester, '3 Services');
      await tester.scrollUntilVisible(
        find.textContaining('From '),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('From '), findsOneWidget);
      expect(find.text('Other FEASTA event services'), findsOneWidget);
      final eligible = available || scenario == 'other provider';
      if (eligible) {
        final toggle = find.byType(Checkbox);
        expect(toggle, findsOneWidget);
        if (scenario == 'other provider') {
          expect(tester.widget<Checkbox>(toggle).onChanged, isNull);
          expect(
            find.text('No eligible services are currently available.'),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
          return;
        }
        expect(tester.widget<Checkbox>(toggle).onChanged, isNotNull);
        expect(tester.widget<Checkbox>(toggle).value, isFalse);
        await tester.ensureVisible(toggle);
        await tester.tap(toggle);
        await tester.pumpAndSettle();
        expect(tester.widget<Checkbox>(toggle).value, isTrue);
        expect(find.text('1 / 20 services selected'), findsOneWidget);
        await tester.tap(toggle);
        await tester.pumpAndSettle();
        expect(tester.widget<Checkbox>(toggle).value, isFalse);
        expect(find.text('0 / 20 services selected'), findsOneWidget);
      } else {
        expect(find.byType(Checkbox), findsNothing);
        expect(find.text('Extra service'), findsNothing);
        expect(
          find.text('No eligible services are currently available.'),
          findsNWidgets(2),
        );
      }
      expect(tester.takeException(), isNull);
    });
  }
}
