import 'package:feasta/core/constants/status_constants.dart';
import 'package:feasta/core/theme/app_theme.dart';
import 'package:feasta/core/widgets/widgets.dart';
import 'package:feasta/features/customer/customer_booking_presentation.dart';
import 'package:feasta/features/customer/customer_bookings_screen.dart';
import 'package:feasta/features/customer/booking_details_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/shared/models/customer_payment_request.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

BookingModel _booking({
  String status = 'confirmed',
  int? pending,
  int? rejected,
}) => BookingModel(
  id: 'booking-1',
  bookingCode: 'FEASTA-001',
  customerId: 'customer-1',
  providerId: 'provider-1',
  providerRequestIds: const ['provider-request-1'],
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
  pendingProviderRequestCount: pending,
  rejectedProviderRequestCount: rejected,
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

// Test-only snapshot stub; production reads continue through Firestore.
// ignore: subtype_of_sealed_class
class _BookingDocument implements DocumentSnapshot<Map<String, dynamic>> {
  _BookingDocument(this.fields);
  final Map<String, dynamic> fields;
  @override
  String get id => 'booking-1';
  @override
  Map<String, dynamic> data() => fields;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  final statusInputs = <String, Map<String, dynamic>>{
    'canonical': {'status': 'waiting_for_down_payment'},
    'legacy': {'status': 'waiting_payment'},
    'unknown': {'status': ' future_STATUS '},
    'empty': {'status': ''},
    'missing': {},
    'null': {'status': null},
    'integer': {'status': 42},
    'double': {'status': 1.5},
    'boolean': {'status': true},
    'list': {
      'status': ['confirmed'],
    },
    'map': {
      'status': {'status': 'confirmed'},
    },
  };
  for (final entry in statusInputs.entries) {
    test('decode ${entry.key} without changing legitimate status strings', () {
      final booking = BookingModel.fromDoc(_BookingDocument(entry.value));
      final raw = entry.value['status'];
      expect(booking.status, raw is String ? raw : '');
      if (raw is! String || raw.isEmpty || entry.key == 'unknown') {
        expect(
          CustomerBookingPresentation(booking).label,
          'Status unavailable',
        );
        expect(BookingStatus.isWaitingForPayment(booking.status), isFalse);
      }
    });
    if (entry.key != 'canonical' && entry.key != 'legacy') {
      testWidgets(
        '${entry.key} renders safe card/detail fallback without payment or chat actions',
        (tester) async {
          final booking = BookingModel.fromDoc(_BookingDocument(entry.value));
          await tester.pumpWidget(
            MaterialApp(
              home: Scaffold(
                body: SingleChildScrollView(
                  child: Column(
                    children: [
                      BookingCard(booking: booking),
                      BookingStatusCard(booking: booking),
                      BookingNextActionCard(booking: booking),
                    ],
                  ),
                ),
              ),
            ),
          );
          expect(find.text('Status unavailable'), findsNWidgets(2));
          expect(find.widgetWithText(ElevatedButton, 'Chat'), findsNothing);
          expect(
            find.widgetWithText(ElevatedButton, 'Pay down payment'),
            findsNothing,
          );
          expect(
            find.widgetWithText(ElevatedButton, 'Pay full payment'),
            findsNothing,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
  test('malformed parent status cannot enable canonical provider checkout', () {
    final request = _BookingDocument({
      // Preserve the historical positive control with frozen server evidence.
      'acceptedAt': Timestamp.fromDate(DateTime.utc(2026, 11, 1, 1)),
      'expiresAt': Timestamp.fromDate(DateTime.utc(2026, 11, 2, 1)),
      'status': 'waiting_for_down_payment',
      'paymentStatus': 'unpaid',
      'financialSnapshot': {
        'schemaVersion': 1,
        'currency': 'PHP',
        'grossAmountInCentavos': 100000,
        'requiredUpfrontAmountInCentavos': 100000,
        'remainingBalanceInCentavos': 0,
      },
    });
    // Positive control proves this request is otherwise eligible.
    expect(
      CustomerProviderPaymentRequest.fromDoc(
        request,
        mainEventStatus: 'waiting_for_down_payment',
      ).canStartCheckout,
      isTrue,
    );
    for (final fields in statusInputs.values) {
      final raw = fields['status'];
      if (raw == 'waiting_payment' || raw == 'waiting_for_down_payment') {
        continue;
      }
      final booking = BookingModel.fromDoc(_BookingDocument(fields));
      expect(
        CustomerProviderPaymentRequest.fromDoc(
          request,
          mainEventStatus: booking.status,
        ).canStartCheckout,
        isFalse,
      );
    }
  });
  test(
    'malformed status does not prevent decoding the rest of a booking list',
    () {
      final bookings = [
        _BookingDocument({'status': 'confirmed'}),
        _BookingDocument({
          'status': {'unexpected': true},
        }),
        _BookingDocument({'status': 'waiting_payment'}),
      ].map(BookingModel.fromDoc).toList();
      expect(bookings.map((booking) => booking.status), [
        'confirmed',
        '',
        'waiting_payment',
      ]);
    },
  );
  final providerScenarios =
      <
        String,
        ({
          int? pending,
          int? rejected,
          String label,
          String message,
          FeastaStatusTone tone,
        })
      >{
        'pending': (
          pending: 1,
          rejected: 0,
          label: 'Awaiting provider',
          message: 'awaiting a response',
          tone: FeastaStatusTone.warning,
        ),
        'declined only': (
          pending: 0,
          rejected: 1,
          label: 'Review provider responses',
          message: 'declined',
          tone: FeastaStatusTone.neutral,
        ),
        'missing evidence': (
          pending: null,
          rejected: null,
          label: 'Response status unavailable',
          message: 'incomplete',
          tone: FeastaStatusTone.neutral,
        ),
        'empty response set': (
          pending: 0,
          rejected: 0,
          label: 'Response status unavailable',
          message: 'incomplete',
          tone: FeastaStatusTone.neutral,
        ),
        'partial evidence': (
          pending: null,
          rejected: 1,
          label: 'Review provider responses',
          message: 'declined',
          tone: FeastaStatusTone.neutral,
        ),
        'multiple providers': (
          pending: 1,
          rejected: 1,
          label: 'Awaiting provider',
          message: 'other requests await a response',
          tone: FeastaStatusTone.warning,
        ),
      };
  for (final entry in providerScenarios.entries) {
    testWidgets(
      '${entry.key}: card/detail badge, guidance and semantics agree at large text',
      (tester) async {
        tester.view.physicalSize = const Size(360, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final semantics = tester.ensureSemantics();
        try {
          final scenario = entry.value;
          final booking = _booking(
            status: 'pending_provider_approval',
            pending: scenario.pending,
            rejected: scenario.rejected,
          );
          final presentation = CustomerBookingPresentation(booking);
          expect(booking.status, 'pending_provider_approval');
          expect(presentation.label, scenario.label);
          expect(presentation.tone, scenario.tone);
          expect(presentation.message, contains(scenario.message));
          expect(
            BookingCard(booking: booking).nextStepDescription,
            BookingStatusCard(booking: booking).statusMessage,
          );
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light,
              home: MediaQuery(
                data: const MediaQueryData(textScaler: TextScaler.linear(2)),
                child: Scaffold(
                  body: SingleChildScrollView(
                    child: Column(
                      children: [
                        BookingCard(booking: booking),
                        BookingStatusCard(booking: booking),
                        BookingNextActionCard(booking: booking),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
          for (final type in [BookingCard, BookingStatusCard]) {
            expect(
              find.descendant(
                of: find.byType(type),
                matching: find.text(scenario.label),
              ),
              findsWidgets,
            );
            expect(
              find.descendant(
                of: find.byType(type),
                matching: find.text(presentation.message),
              ),
              findsOneWidget,
            );
          }
          expect(
            find.bySemanticsLabel(RegExp('Status ${scenario.label}')),
            findsWidgets,
          );
          expect(
            find.bySemanticsLabel(RegExp(RegExp.escape(presentation.message))),
            findsWidgets,
          );
          if (scenario.pending != 1) {
            expect(find.text('Awaiting provider'), findsNothing);
          }
          expect(find.widgetWithText(ElevatedButton, 'Chat'), findsNothing);
          expect(
            find.widgetWithText(ElevatedButton, 'Pay down payment'),
            findsNothing,
          );
          expect(tester.takeException(), isNull);
        } finally {
          semantics.dispose();
        }
      },
    );
  }
  test('response counts reject invalid data and preserve raw status', () {
    for (final value in [null, -1, 1.5, '1', double.nan]) {
      final booking = BookingModel.fromDoc(
        _BookingDocument({
          'status': 'future_status',
          'pendingProviderRequestCount': value,
          'rejectedProviderRequestCount': value,
        }),
      );
      expect(booking.status, 'future_status');
      expect(booking.pendingProviderRequestCount, isNull);
      expect(booking.rejectedProviderRequestCount, isNull);
    }
    final booking = BookingModel.fromDoc(
      _BookingDocument({
        'status': 'pending_provider_approval',
        'pendingProviderRequestCount': 0,
        'rejectedProviderRequestCount': 2,
      }),
    );
    expect(booking.pendingProviderRequestCount, 0);
    expect(booking.rejectedProviderRequestCount, 2);
    expect(CustomerBookingPresentation(booking).message, contains('declined'));
  });
  const labels = {
    'draft': 'Draft',
    'pending_provider_approval': 'Response status unavailable',
    'needs_provider_replacement': 'Provider replacement needed',
    'pending': 'Pending Review',
    'accepted': 'Accepted',
    'waiting_payment': 'Payment Required',
    'waiting_for_down_payment': 'Payment Required',
    'payment_processing': 'Processing Payment',
    'confirmed': 'Confirmed',
    'in_progress': 'In Progress',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'rejected': 'Rejected',
    'expired': 'Expired',
    'new_backend_status': 'Status unavailable',
    '': 'Status unavailable',
  };
  for (final entry in labels.entries) {
    test('card and detail agree for ${entry.key}', () {
      final booking = _booking(status: entry.key);
      final card = BookingCard(booking: booking);
      final detail = BookingStatusCard(booking: booking);
      expect(card.statusLabel, entry.value);
      expect(detail.statusLabel, entry.value);
      expect(card.nextStepDescription, detail.statusMessage);
      expect(booking.status, entry.key);
      expect(
        BookingStatus.isWaitingForPayment(booking.status),
        ['waiting_payment', 'waiting_for_down_payment'].contains(entry.key),
      );
    });
  }
  test('awaiting guidance requires positive response evidence', () {
    for (final status in ['pending', 'pending_provider_approval']) {
      final missing = CustomerBookingPresentation(_booking(status: status));
      expect(missing.message, contains('incomplete'));
      final pending = CustomerBookingPresentation(
        _booking(status: status, pending: 1),
      );
      expect(pending.title, 'Awaiting provider response');
      final declined = CustomerBookingPresentation(
        _booking(status: status, pending: 0, rejected: 1),
      );
      expect(declined.message, contains('declined'));
      expect(declined.message, isNot(contains('awaiting')));
      final empty = CustomerBookingPresentation(
        _booking(status: status, pending: 0),
      );
      expect(empty.message, contains('incomplete'));
    }
  });
  test('replacement distinguishes pending and declined-only responses', () {
    final declined = CustomerBookingPresentation(
      _booking(status: 'needs_provider_replacement', pending: 0, rejected: 1),
    );
    expect(declined.message, isNot(contains('respond')));
    final mixed = CustomerBookingPresentation(
      _booking(status: 'needs_provider_replacement', pending: 1, rejected: 1),
    );
    expect(mixed.message, contains('other providers respond'));
  });
  test(
    'event status never promises canonical provider approval or actions',
    () {
      for (final status in labels.keys) {
        final message = CustomerBookingPresentation(
          _booking(status: status),
        ).message;
        expect(message, isNot(contains('provider accepted')));
        expect(message, isNot(contains('through Chat')));
        expect(message, isNot(contains('choose a provider')));
      }
    },
  );
  for (final status in labels.keys) {
    testWidgets('$status stays accessible at large text on card and details', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final semantics = tester.ensureSemantics();
      final booking = _booking(status: status);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: SingleChildScrollView(
                child: Column(
                  children: [
                    BookingCard(booking: booking),
                    BookingStatusCard(booking: booking),
                    BookingNextActionCard(booking: booking),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      expect(
        find.descendant(
          of: find.byType(BookingStatusCard),
          matching: find.text(labels[status]!),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(BookingCard),
          matching: find.text(labels[status]!),
        ),
        findsWidgets,
      );
      expect(
        find.bySemanticsLabel(RegExp('Status ${labels[status]}')),
        findsWidgets,
      );
      expect(tester.takeException(), isNull);
      // Existing card actions retain their original event-status gates.
      expect(
        find.widgetWithText(ElevatedButton, 'Chat'),
        ['confirmed', 'completed'].contains(status)
            ? findsOneWidget
            : findsNothing,
      );
      expect(
        find.widgetWithText(ElevatedButton, 'Pay down payment'),
        ['waiting_payment', 'waiting_for_down_payment'].contains(status)
            ? findsOneWidget
            : findsNothing,
      );
      semantics.dispose();
    });
  }
}
