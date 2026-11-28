// Offline Firestore snapshots: no Firebase service is initialized by this suite.
// ignore_for_file: subtype_of_sealed_class
import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:feasta/core/widgets/widgets.dart';
import 'package:feasta/features/customer/booking_details_screen.dart';
import 'package:feasta/features/customer/booking_lifecycle_presentation.dart';
import 'package:feasta/features/customer/customer_bookings_controller.dart';
import 'package:feasta/features/customer/customer_bookings_screen.dart';
import 'package:feasta/features/customer/independent_booking_display.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/shared/models/independent_booking.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _Document extends Fake
    implements QueryDocumentSnapshot<Map<String, dynamic>> {
  _Document(this.id, this.fields);
  @override
  final String id;
  final Map<String, dynamic> fields;
  @override
  Map<String, dynamic> data() => fields;
}

class _Snapshot extends Fake implements QuerySnapshot<Map<String, dynamic>> {
  _Snapshot(this.docs);
  @override
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs;
}

Map<String, dynamic> parent({bool mixed = true}) => {
  'mainEventId': 'event_123',
  'bookingId': 'event_123',
  'bookingCode': 'BK-EVENT123',
  'customerId': 'customer_123',
  'providerId': 'catering_123',
  'providerBusinessName': 'First Catering',
  'packageId': 'package_123',
  'packageName': 'Celebration package',
  'eventType': 'Wedding',
  'eventDate': Timestamp.fromDate(DateTime(2030, 1, 5)),
  'eventTime': '14:00',
  'eventEndTime': '18:00',
  'eventLocation': 'Ormoc City',
  'eventAddress': 'Main Street',
  'status': 'pending_provider_approval',
  'paymentStatus': 'paid',
  'packagePrice': 50000,
  'addOnsTotal': mixed ? 10000 : 0,
  'totalAmount': mixed ? 60000 : 50000,
  'packageAssignmentVersion': mixed ? 2 : 1,
  'providerRequestIds': ['request_catering', if (mixed) 'request_photo'],
  if (mixed)
    'providerAssignments': [
      {
        'kind': 'catering_package',
        'providerRequestId': 'request_catering',
        'providerId': 'catering_123',
        'packageId': 'package_123',
        'amount': 50000,
      },
      {
        'kind': 'marketplace_service',
        'providerRequestId': 'request_photo',
        'providerId': 'photographer_123',
        'serviceId': 'service_photo',
        'packageId': null,
        'amount': 10000,
      },
    ],
  'packageAssignments': [
    {
      'providerRequestId': 'request_catering',
      'providerId': 'catering_123',
      'packageId': 'package_123',
      'amount': 50000,
    },
    if (mixed)
      {
        'providerRequestId': 'request_photo',
        'providerId': 'photographer_123',
        'packageId': null,
        'amount': 10000,
      },
  ],
};

Map<String, Map<String, dynamic>> records({
  String catering = 'accepted',
  String photo = 'pending',
}) => {
  'request_catering': {
    'providerRequestId': 'request_catering',
    'mainEventId': 'event_123',
    'bookingId': 'event_123',
    'customerId': 'customer_123',
    'providerId': 'catering_123',
    'providerBusinessName': 'First Catering',
    'packageId': 'package_123',
    'packageName': 'Celebration package',
    'type': 'catering',
    'amount': 50000,
    'status': catering,
    'paymentStatus': 'paid',
    'services': [
      {
        'serviceId': 'package_123',
        'name': 'Celebration package',
        'category': 'catering_package',
        'price': 50000,
      },
    ],
    'financialSnapshot': {
      'schemaVersion': 1,
      'currency': 'PHP',
      'grossAmountInCentavos': 5000000,
      'requiredUpfrontAmountInCentavos': 1000000,
      'remainingBalanceInCentavos': 4000000,
    },
    'settlementSchemaVersion': 1,
    'settlementStatus': 'deposit_settled',
    'grossSettledAmountInCentavos': 1000000,
    'outstandingAmountInCentavos': 4000000,
  },
  'request_photo': {
    'providerRequestId': 'request_photo',
    'mainEventId': 'event_123',
    'bookingId': 'event_123',
    'customerId': 'customer_123',
    'providerId': 'photographer_123',
    'providerBusinessName': 'Bright Photography',
    'serviceId': 'service_photo',
    'type': 'addon',
    'amount': 10000,
    'status': photo,
    'paymentStatus': 'unpaid',
    'services': [
      {
        'serviceId': 'service_photo',
        'name': 'Wedding Photography',
        'category': 'Photography',
        'price': 10000,
      },
    ],
  },
};
BookingModel booking(Map<String, dynamic> fields) =>
    BookingModel.fromDoc(_Document('event_123', fields));
QuerySnapshot<Map<String, dynamic>> snapshot(
  Map<String, Map<String, dynamic>> rows,
) => _Snapshot([
  for (final entry in rows.entries) _Document(entry.key, entry.value),
]);

class _BookingsSource implements CustomerBookingsSource {
  _BookingsSource(this.value);
  final BookingModel value;
  @override
  String get currentUid => value.customerId;
  @override
  Stream<String?> get accounts => const Stream.empty();
  @override
  Stream<CustomerBookingsPage> watch(String uid, Object? cursor) =>
      Stream.value(CustomerBookingsPage([value], null, false));
}

Future<void> pumpDetails(
  WidgetTester tester,
  BookingModel event,
  Stream<QuerySnapshot<Map<String, dynamic>>> stream, {
  double scale = 1,
}) async {
  await tester.pumpWidget(
    BookingLifecycleScope(
      source: (_) => stream,
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: BookingDetailsScreen(
          bookingId: event.id,
          bookingStream: Stream.value(event),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  for (final guard in [
    'eligible',
    'missing deadline',
    'provider review',
    'event review',
  ]) {
    testWidgets('payment entry retains existing eligibility: $guard', (
      tester,
    ) async {
      final fields = parent();
      final rows = records();
      final photo = rows['request_photo']!;
      photo.addAll({
        'status': 'waiting_for_down_payment',
        'financialSnapshot': {
          'schemaVersion': 1,
          'currency': 'PHP',
          'grossAmountInCentavos': 1000000,
          'requiredUpfrontAmountInCentavos': 1000000,
          'remainingBalanceInCentavos': 0,
        },
        'acceptedAt': Timestamp.fromDate(DateTime.utc(2029, 1, 1)),
        'expiresAt': Timestamp.fromDate(DateTime.utc(2029, 1, 1, 6)),
      });
      if (guard == 'missing deadline') photo.remove('expiresAt');
      if (guard == 'provider review') photo['reconciliationRequired'] = true;
      if (guard == 'event review') fields['reconciliationRequired'] = true;
      await pumpDetails(tester, booking(fields), Stream.value(snapshot(rows)));
      expect(
        find.text('Manage Payments'),
        guard == 'eligible' ? findsOneWidget : findsNothing,
      );
      expect(
        find.byKey(const ValueKey('provider-request-request_catering')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('provider-request-request_photo')),
        findsOneWidget,
      );
    });
  }
  test('three providers use each assignment once and preserve centavos', () {
    final fields = parent();
    (fields['providerAssignments'] as List).add({
      'kind': 'marketplace_service',
      'providerRequestId': 'request_music',
      'providerId': 'musician_123',
      'serviceId': 'service_music',
      'amount': 10000.25,
    });
    (fields['providerRequestIds'] as List).add('request_music');
    fields['totalAmount'] = 70000.25;
    final rows = records();
    rows['request_music'] = {
      ...rows['request_photo']!,
      'providerRequestId': 'request_music',
      'providerId': 'musician_123',
      'providerBusinessName': 'Live Music',
      'serviceId': 'service_music',
      'amount': 10000.25,
      'services': [
        {
          'serviceId': 'service_music',
          'name': 'Wedding Music',
          'category': 'Music',
          'price': 10000.25,
        },
      ],
    };
    final event = booking(fields);
    final projection = IndependentBooking.fromBooking(event);
    expect(projection.totalInCentavos, 7000025);
    expect(projection.readRequests(event, rows), hasLength(3));
  });
  testWidgets(
    'invalid mixed assignments show review state without an invented amount',
    (tester) async {
      final fields = parent()..remove('providerAssignments');
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: IndependentBookingSummary(booking: booking(fields)),
          ),
        ),
      );
      expect(find.text('Provider information needs review'), findsOneWidget);
      expect(find.byType(FeastaPriceText), findsNothing);
      expect(find.text('First Catering'), findsNothing);
    },
  );
  test(
    'mixed assignments are authoritative over duplicate legacy projections',
    () {
      final event = booking(parent());
      final projection = IndependentBooking.fromBooking(event);
      expect(event.hasIndependentProviderAssignments, isTrue);
      expect(projection.assignments, hasLength(2));
      expect(projection.totalInCentavos, 6000000);
      expect(projection.cateringInCentavos, 5000000);
      expect(projection.marketplaceInCentavos, 1000000);
      final rows = records();
      final requests = projection.readRequests(event, rows);
      expect(requests.map((r) => r.status), ['accepted', 'pending']);
      expect(requests.map((r) => r.paymentStatus), ['paid', 'unpaid']);
      expect(requests.first.settledInCentavos, 1000000);
      expect(requests.first.outstandingInCentavos, 4000000);
      expect(requests.last.outstandingInCentavos, isNull);
      expect(rows['request_photo']!.containsKey('packageId'), isFalse);
      expect(requests.last.assignment.selectionId, 'service_photo');
    },
  );
  test('legacy packageAssignments remain Catering only', () {
    final event = booking(parent(mixed: false));
    expect(event.hasIndependentProviderAssignments, isFalse);
    final projection = IndependentBooking.fromBooking(event);
    expect(projection.assignments.single.marketplace, isFalse);
    expect(projection.totalInCentavos, 5000000);
    final rows = records()..remove('request_photo');
    expect(
      projection.readRequests(event, rows).single.serviceName,
      'Celebration package',
    );
  });
  for (final states in [
    ('accepted', 'pending'),
    ('accepted', 'rejected'),
    ('rejected', 'accepted'),
    ('confirmed', 'pending'),
  ]) {
    testWidgets('independent request states ${states.$1}/${states.$2}', (
      tester,
    ) async {
      await pumpDetails(
        tester,
        booking(parent()),
        Stream.value(snapshot(records(catering: states.$1, photo: states.$2))),
      );
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('provider-request-request_photo')),
        250,
      );
      final catering = find.byKey(
        const ValueKey('provider-request-request_catering'),
      );
      final photo = find.byKey(
        const ValueKey('provider-request-request_photo'),
      );
      String label(String value) =>
          '${value[0].toUpperCase()}${value.substring(1)}';
      expect(
        find.descendant(
          of: catering,
          matching: find.text('Request status: ${label(states.$1)}'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: photo,
          matching: find.text('Request status: ${label(states.$2)}'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: catering,
          matching: find.text('Payment status: Paid'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: photo,
          matching: find.text('Payment status: Unpaid'),
        ),
        findsOneWidget,
      );
      expect(find.text('Wedding Photography'), findsOneWidget);
      expect(find.text('Bright Photography'), findsOneWidget);
      expect(find.byType(PaymentDetailsCard), findsNothing);
      expect(find.byType(BookingAddOnsCard), findsNothing);
      expect(find.byType(ActionButtons), findsNothing);
      expect(find.text('Manage Payments'), findsNothing);
      final amounts = tester
          .widgetList<FeastaPriceText>(find.byType(FeastaPriceText))
          .map((w) => w.amount)
          .toList();
      expect(amounts.where((a) => a == 60000), hasLength(1));
      expect(amounts.where((a) => a == 50000), hasLength(1));
      expect(amounts.where((a) => a == 40000), hasLength(1));
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
    'list renders one parent, shared schedule and total, no first-provider identity',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CustomerBookingsScreen(
              source: _BookingsSource(booking(parent())),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(IndependentBookingSummary), findsOneWidget);
      expect(find.text('2 independent providers'), findsOneWidget);
      expect(find.text('Event date: 2030-01-05'), findsOneWidget);
      expect(find.text('14:00 – 18:00'), findsOneWidget);
      expect(find.text('Ormoc City\nMain Street'), findsOneWidget);
      expect(find.text('First Catering'), findsNothing);
      expect(find.text('Celebration package'), findsNothing);
      expect(
        tester.widget<FeastaPriceText>(find.byType(FeastaPriceText)).amount,
        60000,
      );
    },
  );
  testWidgets('single Catering booking retains legacy list content', (
    tester,
  ) async {
    await tester.pumpWidget(
      BookingLifecycleScope(
        source: (_) =>
            Stream.value(snapshot(records()..remove('request_photo'))),
        child: MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: BookingCard(booking: booking(parent(mixed: false))),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(IndependentBookingSummary), findsNothing);
    expect(find.text('First Catering'), findsWidgets);
    expect(find.text('Celebration package'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
  for (final defect in [
    'missing assignment',
    'duplicate assignment',
    'duplicate provider',
    'duplicate request id',
    'wrong total',
    'wrong kind',
    'missing service id',
    'fake package id',
    'missing version',
  ]) {
    test('$defect parent fails closed', () {
      final fields = parent();
      final rows = fields['providerAssignments'] as List;
      switch (defect) {
        case 'missing assignment':
          fields.remove('providerAssignments');
        case 'duplicate assignment':
          rows[1] = rows[0];
        case 'duplicate provider':
          rows[1]['providerId'] = rows[0]['providerId'];
        case 'duplicate request id':
          fields['providerRequestIds'] = [
            'request_catering',
            'request_catering',
          ];
        case 'wrong total':
          fields['totalAmount'] = 70000;
        case 'wrong kind':
          rows[1]['kind'] = 'unknown';
        case 'missing service id':
          rows[1].remove('serviceId');
        case 'fake package id':
          rows[1]['packageId'] = 'fake_package';
        case 'missing version':
          fields.remove('packageAssignmentVersion');
      }
      expect(
        () => IndependentBooking.fromBooking(booking(fields)),
        throwsFormatException,
      );
    });
  }
  for (final defect in [
    'missing request',
    'wrong customer',
    'wrong event',
    'wrong provider',
    'wrong request id',
    'wrong service',
    'wrong type',
    'wrong amount',
    'wrong service amount',
    'missing provider name',
    'invalid financial snapshot',
    'invalid settlement',
  ]) {
    test('$defect request fails closed', () {
      final event = booking(parent());
      final rows = records();
      final row = rows['request_photo']!;
      switch (defect) {
        case 'missing request':
          rows.remove('request_photo');
        case 'wrong customer':
          row['customerId'] = 'other_customer';
        case 'wrong event':
          row['mainEventId'] = 'other_event';
        case 'wrong provider':
          row['providerId'] = 'other_provider';
        case 'wrong request id':
          row['providerRequestId'] = 'other_request';
        case 'wrong service':
          row['serviceId'] = 'other_service';
        case 'wrong type':
          row['type'] = 'catering';
        case 'wrong amount':
          row['amount'] = 20000;
        case 'wrong service amount':
          row['services'][0]['price'] = 20000;
        case 'missing provider name':
          row.remove('providerBusinessName');
        case 'invalid financial snapshot':
          row['financialSnapshot'] = {'schemaVersion': 1};
        case 'invalid settlement':
          row['settlementSchemaVersion'] = 1;
      }
      expect(
        () => IndependentBooking.fromBooking(event).readRequests(event, rows),
        throwsFormatException,
      );
    });
  }
  testWidgets(
    'missing request shows actionable refresh and no partial cards or payment action',
    (tester) async {
      await pumpDetails(
        tester,
        booking(parent()),
        Stream.value(snapshot(records()..remove('request_photo'))),
      );
      expect(find.text('Refresh provider details'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('provider-request-request_catering')),
        findsNothing,
      );
      expect(find.text('Manage Payments'), findsNothing);
    },
  );
  testWidgets(
    'unknown provider state is unavailable rather than parent state',
    (tester) async {
      final rows = records();
      rows['request_photo']!.remove('paymentStatus');
      rows['request_photo']!['status'] = 'future_status';
      await pumpDetails(
        tester,
        booking(parent()),
        Stream.value(snapshot(rows)),
      );
      expect(find.text('Request status: Status unavailable'), findsOneWidget);
      expect(find.text('Payment status: Unavailable'), findsOneWidget);
      expect(find.text('Manage Payments'), findsNothing);
    },
  );
  testWidgets('live updates replace provider cards without duplicating them', (
    tester,
  ) async {
    final updates = StreamController<QuerySnapshot<Map<String, dynamic>>>();
    await tester.pumpWidget(
      BookingLifecycleScope(
        source: (_) => updates.stream,
        child: MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: IndependentBookingDetails(booking: booking(parent())),
            ),
          ),
        ),
      ),
    );
    updates.add(snapshot(records()));
    await tester.pumpAndSettle();
    updates.add(snapshot(records(photo: 'accepted')));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('provider-request-request_photo')),
      findsOneWidget,
    );
    expect(find.text('Request status: Accepted'), findsNWidgets(2));
    updates.addError(StateError('offline'));
    await tester.pumpAndSettle();
    expect(find.text('Refresh provider details'), findsOneWidget);
    expect(find.text('Manage Payments'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    unawaited(updates.close());
    await tester.pump();
  });
  testWidgets('mixed details support narrow screens and large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await pumpDetails(
      tester,
      booking(parent()),
      Stream.value(snapshot(records())),
      scale: 2,
    );
    await tester.scrollUntilVisible(find.text('Wedding Photography'), 200);
    expect(tester.takeException(), isNull);
  });
}
