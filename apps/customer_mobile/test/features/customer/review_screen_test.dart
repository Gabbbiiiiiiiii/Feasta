import 'package:feasta/features/customer/review_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ReviewScreen', () {
    testWidgets('allows a completed unreviewed booking to submit a review', (
      tester,
    ) async {
      BookingModel? submittedBooking;
      int? submittedRating;
      String? submittedComment;

      await tester.pumpWidget(
        _testApp(
          booking: _booking(status: 'completed'),
          reviewExistsChecker: (_) async => false,
          reviewSubmitter:
              ({required booking, required rating, required comment}) async {
                submittedBooking = booking;
                submittedRating = rating;
                submittedComment = comment;

                return true;
              },
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Write Review'), findsOneWidget);
      expect(find.text('Submit Review'), findsOneWidget);
      expect(find.text('5 out of 5'), findsOneWidget);

      await tester.enterText(
        find.byType(TextField),
        'Excellent catering service.',
      );

      await tester.tap(find.text('Submit Review'));
      await tester.pumpAndSettle();

      expect(submittedBooking?.id, 'booking-one');
      expect(submittedRating, 5);
      expect(submittedComment, 'Excellent catering service.');
    });

    testWidgets('does not allow an existing review to be submitted again', (
      tester,
    ) async {
      var submissionCount = 0;

      await tester.pumpWidget(
        _testApp(
          booking: _booking(status: 'completed'),
          reviewExistsChecker: (_) async => true,
          reviewSubmitter:
              ({required booking, required rating, required comment}) async {
                submissionCount += 1;
                return true;
              },
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Review submitted'), findsOneWidget);

      expect(
        find.text('You already submitted a review for this booking.'),
        findsOneWidget,
      );

      expect(find.text('Submit Review'), findsNothing);
      expect(submissionCount, 0);
    });

    testWidgets('rejects review access for a booking that is not completed', (
      tester,
    ) async {
      await tester.pumpWidget(
        _testApp(
          booking: _booking(status: 'confirmed'),
          reviewExistsChecker: (_) async => false,
          reviewSubmitter:
              ({required booking, required rating, required comment}) async {
                return true;
              },
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Review unavailable'), findsOneWidget);

      expect(
        find.text('Only completed bookings can be reviewed.'),
        findsOneWidget,
      );

      expect(find.text('Submit Review'), findsNothing);
    });

    testWidgets('requires at least two review characters', (tester) async {
      var submissionCount = 0;

      await tester.pumpWidget(
        _testApp(
          booking: _booking(status: 'completed'),
          reviewExistsChecker: (_) async => false,
          reviewSubmitter:
              ({required booking, required rating, required comment}) async {
                submissionCount += 1;
                return true;
              },
        ),
      );

      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'A');

      await tester.tap(find.text('Submit Review'));
      await tester.pump();

      expect(
        find.text('Please write a short review of at least 2 characters.'),
        findsOneWidget,
      );

      expect(submissionCount, 0);
    });

    testWidgets('allows the customer to change the star rating', (
      tester,
    ) async {
      int? submittedRating;

      await tester.pumpWidget(
        _testApp(
          booking: _booking(status: 'completed'),
          reviewExistsChecker: (_) async => false,
          reviewSubmitter:
              ({required booking, required rating, required comment}) async {
                submittedRating = rating;
                return true;
              },
        ),
      );

      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('3 stars'));

      await tester.pump();

      expect(find.text('3 out of 5'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'Good service overall.');

      await tester.tap(find.text('Submit Review'));
      await tester.pumpAndSettle();

      expect(submittedRating, 3);
    });

    testWidgets('handles an idempotent duplicate response safely', (
      tester,
    ) async {
      await tester.pumpWidget(
        _testApp(
          booking: _booking(status: 'completed'),
          reviewExistsChecker: (_) async => false,
          reviewSubmitter:
              ({required booking, required rating, required comment}) async {
                return false;
              },
        ),
      );

      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'Great experience.');

      await tester.tap(find.text('Submit Review'));
      await tester.pumpAndSettle();

      expect(find.text('Review submitted'), findsOneWidget);

      expect(
        find.text('You already submitted a review for this booking.'),
        findsOneWidget,
      );

      expect(find.text('Submit Review'), findsNothing);
    });
  });
}

Widget _testApp({
  required BookingModel booking,
  required ReviewExistsChecker reviewExistsChecker,
  required ReviewSubmitter reviewSubmitter,
}) {
  return MaterialApp(
    home: ReviewScreen(
      booking: booking,
      reviewExistsChecker: reviewExistsChecker,
      reviewSubmitter: reviewSubmitter,
    ),
  );
}

BookingModel _booking({required String status}) {
  return BookingModel(
    id: 'booking-one',
    bookingCode: 'FEASTA-TEST-001',
    customerId: 'customer-one',
    providerId: 'provider-one',
    providerRequestIds: const <String>[],
    packageId: 'package-one',
    customerFirstName: 'Customer',
    customerLastName: 'One',
    customerEmail: 'customer@example.test',
    customerPhoneNumber: '+639171234567',
    providerBusinessName: 'Test Catering',
    packageName: 'Classic Package',
    eventType: 'Birthday',
    eventDate: DateTime(2026, 8, 16),
    eventTime: '10:00 AM',
    eventEndTime: '2:00 PM',
    guestCount: 50,
    eventLocation: 'Ormoc City',
    eventAddress: 'Main Street, Ormoc City',
    selectedFoods: const <String>[],
    selectedDecorations: const <String>[],
    selectedFurniture: const <String>[],
    selectedAddOns: const <Map<String, dynamic>>[],
    willArrangeOwnAddOns: false,
    customerArrangedAddOnsNote: '',
    specialRequest: '',
    packagePrice: 15000,
    addOnsTotal: 0,
    totalAmount: 15000,
    downPaymentPercentage: 50,
    downPaymentAmount: 7500,
    remainingBalance: 7500,
    status: status,
    paymentStatus: 'paid',
    cancellationReason: null,
    rejectedReason: null,
    cancellationStatus: 'none',
    refundStatus: 'none',
    refundAmount: 0,
    refundPolicyType: null,
    refundPercentage: 0,
    recoveryStatus: 'none',
    originalProviderId: 'provider-one',
    currentProviderId: 'provider-one',
    rejectedByProviderIds: const <String>[],
    selectedRecoveryOfferId: null,
    recoveryOpenedAt: null,
    recoveryCompletedAt: null,
    paymentDeadline: null,
    acceptedAt: DateTime(2026, 8, 1),
    confirmedAt: DateTime(2026, 8, 2),
    completedAt: status == 'completed' ? DateTime(2026, 8, 16) : null,
    cancelledAt: null,
    createdAt: DateTime(2026, 7, 20),
    updatedAt: DateTime(2026, 8, 16),
  );
}
