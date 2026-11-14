import 'package:feasta/features/customer/booking_agreement_controller.dart';
import 'package:feasta/features/customer/booking_payment_requirement.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'package:feasta/features/customer/customization_session.dart';
import 'package:feasta/shared/models/customer_availability.dart';
import 'package:feasta/shared/models/booking_agreement.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'booking_agreement_fixtures.dart';
import 'booking_attempt_test.dart' show MemoryStore;
import 'booking_preparation_flow_test.dart' show PreparationAuth, reviewData;
import 'booking_preparation_test.dart' show preparationPackage;
import 'provider_discovery_test.dart' show provider, GuestAuth;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });

  testWidgets(
    'payment summary uses each server requirement without accepting it',
    (tester) async {
      final controller = BookingAgreementController(
        loader: (_) async => [
          BookingAgreement.fromJson(agreementFixture()),
          BookingAgreement.fromJson({
            ...agreementFixture(provider: 'provider_456', deposit: false),
            'eligibilityReason': 'short_notice',
          }),
        ],
        resolveProviders: (_) async => {'provider_123', 'provider_456'},
      );
      controller.select(agreementSelection(), ownerId: 'customer-1');
      await controller.load();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: BookingPaymentRequirement(controller: controller),
            ),
          ),
        ),
      );
      expect(find.text('Ana Catering'), findsOneWidget);
      expect(find.text('Music Provider'), findsOneWidget);
      expect(find.text('Deposit currently available'), findsOneWidget);
      expect(find.text('Full payment required'), findsOneWidget);
      expect(find.textContaining('300.01'), findsOneWidget);
      expect(find.textContaining('1,000.01'), findsOneWidget);
      expect(find.textContaining('700.00'), findsOneWidget);
      expect(
        find.text('The 72-hour deposit cutoff has passed for this event.'),
        findsOneWidget,
      );
      expect(controller.allAcknowledged, isFalse);
      final first = controller.agreements.first;
      controller.acknowledge(first.providerId, first.agreementKey, true);
      expect(controller.allAcknowledged, isFalse);
      final last = controller.agreements.last;
      controller.acknowledge(last.providerId, last.agreementKey, true);
      expect(controller.allAcknowledged, isTrue);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
    },
  );

  for (final target in BookingReviewEdit.values) {
    testWidgets('separate edit action returns $target with draft untouched', (
      tester,
    ) async {
      GuestAuth.signedIn = true;
      PreparationAuth.owner = 'customer-1';
      final data = reviewData();
      BookingReviewEdit? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  result = await Navigator.of(context).push<BookingReviewEdit>(
                    MaterialPageRoute(
                      builder: (_) => BookingSummaryScreen(
                        provider: provider(),
                        eventPackage: preparationPackage(),
                        customization: data,
                      ),
                    ),
                  );
                },
                child: const Text('Open review'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open review'));
      await tester.pumpAndSettle();
      expect(
        find.text('${data.eventTime} - ${data.eventEndTime}'),
        findsOneWidget,
      );
      expect(find.text(data.eventAddress), findsOneWidget);
      final foods = List.of(data.selectedFoods);
      final addons = List.of(data.selectedAddOns);
      final notes = data.specialRequest;
      await tester.tap(
        find.text(
          target == BookingReviewEdit.event ? 'Edit event' : 'Edit package',
        ),
      );
      await tester.pumpAndSettle();
      expect(result, target);
      expect(data.selectedFoods, foods);
      expect(data.selectedAddOns, addons);
      expect(data.specialRequest, notes);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('main summary loads payment terms and keeps submission blocked', (
    tester,
  ) async {
    GuestAuth.signedIn = true;
    PreparationAuth.owner = 'customer-1';
    final changes = ChangeNotifier();
    final session = CustomizationSession(
      uid: 'customer-1',
      generation: 1,
      changes: changes,
      isCurrent: () => true,
    );
    final data = reviewData();
    final caterer = provider();
    final package = preparationPackage();
    var loads = 0;
    final agreements = BookingAgreementController(
      loader: (_) async {
        loads++;
        return [
          BookingAgreement.fromJson(agreementFixture(provider: caterer.id)),
        ];
      },
      resolveProviders: (_) async => {caterer.id},
    );
    final availability = CustomerAvailability.parse(
      {
        'results': [
          {
            'providerId': caterer.id,
            'available': true,
            'reasonCode': null,
            'message': 'Available.',
          },
        ],
      },
      uid: 'customer-1',
      providerId: caterer.id,
      packageId: package.id,
      customization: data,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: BookingSummaryScreen(
          provider: caterer,
          eventPackage: package,
          customization: data,
          preparationOnly: false,
          session: session,
          availability: availability,
          agreements: agreements,
          attempts: BookingAttemptCoordinator(
            store: MemoryStore(),
            currentUid: () => 'customer-1',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(loads, greaterThan(0));
    await tester.scrollUntilVisible(
      find.text('Payment requirement for this request'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Deposit currently available'), findsOneWidget);
    expect(agreements.allAcknowledged, isFalse);
    expect(
      tester
          .widget<ElevatedButton>(
            find.widgetWithText(ElevatedButton, 'Submit booking request'),
          )
          .onPressed,
      isNull,
    );
    await tester.pumpWidget(const SizedBox());
    // The summary does not dispose controllers owned by the form.
    expect(
      agreements.matchesSelection(agreementSelection(), 'customer-1'),
      isFalse,
    );
    agreements.dispose();
    session.dispose();
    changes.dispose();
  });
}
