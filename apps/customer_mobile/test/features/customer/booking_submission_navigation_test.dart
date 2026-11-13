import 'package:feasta/shared/models/customer_availability.dart';
import 'package:feasta/shared/models/event_customization_data.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feasta/features/customer/availability_check_screen.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:feasta/features/customer/customization_session.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'booking_preparation_flow_test.dart'
    show
        PreparationRepository,
        PreparationAuth,
        reviewData,
        phone,
        seedDraft,
        openStep;
import 'booking_preparation_test.dart' show preparationPackage;
import 'provider_discovery_test.dart' show provider, GuestAuth;
import 'event_draft_persistence_test.dart' show DraftStore;

class AvailabilityRepository extends PreparationRepository {
  final result = Completer<bool>();
  int checks = 0;
  bool expired = false;
  @override
  Future<CustomerAvailability> checkProviderAvailability({
    required String providerId,
    required String packageId,
    required EventCustomizationData customization,
  }) {
    checks++;
    return result.future.then(
      (available) => CustomerAvailability.parse(
        {
          'results': [
            {
              'providerId': providerId,
              'available': available,
              'reasonCode': available ? null : 'BLOCKED_DATE',
              'message': available
                  ? 'Available for your selected event.'
                  : 'Not available on this date.',
            },
          ],
        },
        checkedAt: expired
            ? DateTime.now().subtract(const Duration(minutes: 6))
            : null,
        uid: 'customer-1',
        providerId: providerId,
        packageId: packageId,
        customization: customization,
      ),
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  late ChangeNotifier changes;
  late CustomizationSession session;
  late AvailabilityRepository repo;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    GuestAuth.signedIn = true;
    PreparationAuth.owner = 'customer-1';
    changes = ChangeNotifier();
    session = CustomizationSession(
      uid: 'customer-1',
      generation: 1,
      changes: changes,
      isCurrent: () =>
          GuestAuth.signedIn && PreparationAuth.owner == 'customer-1',
    );
    repo = AvailabilityRepository();
    eventDraftPersistence = EventDraftPersistence(DraftStore());
  });
  tearDown(() {
    session.dispose();
    changes.dispose();
    GuestAuth.signedIn = false;
  });
  Future<void> showAvailability(WidgetTester tester) async {
    phone(tester);
    repo = AvailabilityRepository();
    await tester.pumpWidget(
      MaterialApp(
        home: AvailabilityCheckScreen(
          provider: provider(),
          eventPackage: preparationPackage(),
          customization: reviewData(),
          session: session,
          repository: repo,
        ),
      ),
    );
    await tester.pump();
  }

  for (final outcome in [
    'available',
    'unavailable',
    'error',
    'expired',
    'changed',
    'signed-out',
  ]) {
    testWidgets('customization final check: $outcome', (tester) async {
      phone(tester);
      final package = preparationPackage({
        'sharedContractVersion': 2,
        'revision': 7,
        'offerStructure': 'customizable',
        'pricingModel': 'per_pax',
        'occasionMatchIds': ['Wedding'],
        'serviceOptions': {
          'full_service': {'price': 650},
        },
      });
      repo = AvailabilityRepository()..current = package;
      await seedDraft();
      final draft = (await eventDraftPersistence.read(
        'customer-1',
        'caterer-1',
        'package-1',
      ))!;
      draft['tier'] = 'full_service';
      await eventDraftPersistence.save(
        'customer-1',
        'caterer-1',
        'package-1',
        draft,
        () => 'customer-1',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: package,
            repository: repo,
            session: session,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await openStep(tester, '3');
      await tester.tap(find.text('Review booking'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(find.byType(AvailabilityCheckScreen), findsNothing);
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      expect(repo.checks, 1);
      expect(find.text('Submit booking request'), findsNothing);
      if (outcome == 'signed-out') {
        GuestAuth.signedIn = false;
        changes.notifyListeners();
      }
      if (outcome == 'changed') {
        final dynamic form = tester.state(
          find.byType(EventCustomizationScreen),
        );
        form.specialRequestController.text = 'Changed while checking';
      }
      repo.expired = outcome == 'expired';
      if (outcome == 'error') {
        repo.result.completeError(StateError('offline'));
      } else {
        repo.result.complete(outcome != 'unavailable');
      }
      await tester.pumpAndSettle();
      if (outcome != 'available') {
        expect(find.byType(BookingSummaryScreen), findsNothing);
        expect(find.text('Submit booking request'), findsNothing);
        expect(find.byType(AvailabilityCheckScreen), findsNothing);
        return;
      }
      expect(find.text('Submit booking request'), findsOneWidget);
      final summary = tester.widget<BookingSummaryScreen>(
        find.byType(BookingSummaryScreen),
      );
      expect(summary.session, same(session));
      expect(summary.customization.eventAddress, 'Main Street, District 1');
      expect(summary.customization.expectedPackageRevision, 7);
      expect(summary.customization.serviceTier, 'full_service');
      expect(summary.preparationOnly, isFalse);
      expect(summary.availability, isNotNull);
      // Both actions return to the existing form; reviewing again reuses the
      // controllers and the complete saved configuration.
      for (final action in ['Edit event', 'Edit package']) {
        await tester.scrollUntilVisible(
          find.text(action),
          120,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(find.text(action));
        await tester.pumpAndSettle();
        expect(find.byType(BookingSummaryScreen), findsNothing);
        final dynamic form = tester.state(
          find.byType(EventCustomizationScreen),
        );
        expect(form.addressController.text, summary.customization.eventAddress);
        expect(form.selectedServiceTier, summary.customization.serviceTier);
        if (action == 'Edit event') {
          expect(find.text('Event details'), findsWidgets);
          await tester.tap(find.text('Continue'));
          await tester.pumpAndSettle();
        } else {
          expect(find.text('Customize your package'), findsOneWidget);
        }
        await tester.tap(find.text('Review booking'));
        await tester.pumpAndSettle();
        final revisited = tester.widget<BookingSummaryScreen>(
          find.byType(BookingSummaryScreen),
        );
        expect(revisited.agreements, same(summary.agreements));
        expect(revisited.refunds, same(summary.refunds));
        expect(
          revisited.customization.eventTime,
          summary.customization.eventTime,
        );
        expect(
          revisited.customization.eventEndTime,
          summary.customization.eventEndTime,
        );
        expect(
          revisited.customization.selectedAddOns,
          summary.customization.selectedAddOns,
        );
      }
    });
  }
  testWidgets(
    'available date opens explicit submitting review without pressing submit',
    (tester) async {
      await showAvailability(tester);
      repo.result.complete(true);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue to Booking Summary'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<BookingSummaryScreen>(find.byType(BookingSummaryScreen))
            .preparationOnly,
        isFalse,
      );
      expect(find.text('Submit booking request'), findsOneWidget);
      expect(repo.unexpected, isEmpty);
    },
  );
  for (final error in [false, true]) {
    testWidgets(
      error
          ? 'availability error blocks review'
          : 'unavailable date blocks review',
      (tester) async {
        await showAvailability(tester);
        if (error) {
          repo.result.completeError(StateError('offline'));
        } else {
          repo.result.complete(false);
        }
        await tester.pumpAndSettle();
        expect(find.text('Continue to Booking Summary'), findsNothing);
        expect(find.text('Submit booking request'), findsNothing);
        expect(find.byType(BookingSummaryScreen), findsNothing);
      },
    );
  }
  for (final switchAccount in [false, true]) {
    testWidgets(
      switchAccount
          ? 'account switch conceals authorized review'
          : 'authentication loss conceals authorized review',
      (tester) async {
        await showAvailability(tester);
        repo.result.complete(true);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Continue to Booking Summary'));
        await tester.pumpAndSettle();
        if (switchAccount) {
          PreparationAuth.owner = 'customer-2';
        } else {
          GuestAuth.signedIn = false;
        }
        changes.notifyListeners();
        await tester.pumpAndSettle();
        expect(find.text('Submit booking request'), findsNothing);
        expect(find.textContaining('Please sign in again'), findsOneWidget);
      },
    );
  }
  testWidgets('duplicate continue taps create only one review route', (
    tester,
  ) async {
    await showAvailability(tester);
    repo.result.complete(true);
    await tester.pumpAndSettle();
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Continue to Booking Summary'),
    );
    button.onPressed!();
    button.onPressed!();
    await tester.pumpAndSettle();
    expect(
      find.byType(BookingSummaryScreen, skipOffstage: false),
      findsOneWidget,
    );
    expect(repo.checks, 1);
    expect(repo.unexpected, isEmpty);
  });
  testWidgets('authentication lost while check is pending cannot open review', (
    tester,
  ) async {
    await showAvailability(tester);
    GuestAuth.signedIn = false;
    changes.notifyListeners();
    repo.result.complete(true);
    await tester.pumpAndSettle();
    expect(find.text('Continue to Booking Summary'), findsNothing);
    expect(find.text('Submit booking request'), findsNothing);
  });
  testWidgets(
    'explicit submitting route without availability stays preparation only',
    (tester) async {
      phone(tester);
      await tester.pumpWidget(
        MaterialApp(
          home: BookingSummaryScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            customization: reviewData(),
            session: session,
            preparationOnly: false,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Submit booking request'), findsNothing);
    },
  );
  testWidgets('default preparation review remains non-submitting', (
    tester,
  ) async {
    phone(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: BookingSummaryScreen(
          provider: provider(),
          eventPackage: preparationPackage(),
          customization: reviewData(),
          session: session,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Submit booking request'), findsNothing);
  });
}
