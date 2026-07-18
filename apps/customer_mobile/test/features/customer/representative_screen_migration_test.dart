import 'package:feasta/core/theme/app_theme.dart';
import 'package:feasta/features/customer/customer_bookings_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

BookingModel _booking({String status = 'confirmed'}) => BookingModel(
  id: 'booking-1',
  bookingCode: 'FEASTA-001',
  customerId: 'customer-1',
  providerId: 'provider-1',
  packageId: 'package-1',
  customerFirstName: 'Ana',
  customerLastName: 'Dela Cruz',
  customerEmail: 'ana@example.test',
  customerPhoneNumber: '09170000000',
  providerBusinessName:
      'A deliberately long provider business name that must remain readable',
  packageName: 'Celebration package',
  eventType: 'Wedding reception',
  eventDate: DateTime(2027, 2, 14),
  eventTime: '10:00',
  eventEndTime: '14:00',
  guestCount: 100,
  eventLocation: 'Manila',
  eventAddress: 'Manila',
  selectedFoods: const [],
  selectedDecorations: const [],
  selectedFurniture: const [],
  selectedAddOns: const [],
  willArrangeOwnAddOns: false,
  customerArrangedAddOnsNote: '',
  specialRequest: '',
  packagePrice: 50000,
  addOnsTotal: 0,
  totalAmount: 50000,
  downPaymentPercentage: 20,
  downPaymentAmount: 10000,
  remainingBalance: 40000,
  status: status,
  paymentStatus: 'pending',
  cancellationStatus: 'none',
  refundStatus: 'none',
  refundAmount: 0,
  refundPercentage: 0,
  recoveryStatus: 'none',
  originalProviderId: 'provider-1',
  currentProviderId: 'provider-1',
  rejectedByProviderIds: const [],
);

Widget _fixture({double textScale = 1}) => MaterialApp(
  theme: AppTheme.light,
  home: MediaQuery(
    data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
    child: Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: BookingCard(booking: _booking()),
      ),
    ),
  ),
);

void main() {
  testWidgets('booking card uses shared status and action primitives', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_fixture());

    expect(find.text('Confirmed'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'View details'), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, 'Chat'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('booking card remains overflow-free at large text scale', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_fixture(textScale: 2));

    expect(find.text('Confirmed'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
