import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:feasta/features/customer/home_booking_timeline.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// ignore: subtype_of_sealed_class
class BookingDoc implements DocumentSnapshot<Map<String, dynamic>> {
  BookingDoc(this.id, this.fields);
  @override
  final String id;
  final Map<String, dynamic> fields;
  @override
  Map<String, dynamic> data() => fields;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

BookingModel booking(
  String id,
  String status, {
  int day = 15,
  bool deleted = false,
}) => BookingModel.fromDoc(
  BookingDoc(id, {
    'status': status,
    'eventDate': Timestamp.fromDate(DateTime.utc(2027, 2, day)),
    'eventTime': '10:00',
    'eventEndTime': '14:00',
    'eventType': 'Wedding',
    'isDeleted': deleted,
  }),
);
void main() {
  test(
    'home excludes terminal, deleted and ended bookings and sorts by schedule',
    () {
      final result = homeActiveBookings([
        booking('later', 'confirmed', day: 20),
        booking('ended', 'in_progress', day: 10),
        booking('completed', 'completed'),
        booking('cancelled', 'cancelled'),
        booking('deleted', 'confirmed', deleted: true),
        booking('pending', 'pending_provider_approval'),
      ], DateTime.utc(2027, 2, 14));
      expect(result.map((b) => b.id), ['later']);
      expect(homeActiveBookings([], DateTime.now()), isEmpty);
    },
  );
  test('home timeline shows confirmed bookings only', () {
    final result = homeActiveBookings([
      booking('pending', 'pending'),
      booking('approval', 'pending_provider_approval'),
      booking('replacement', 'needs_provider_replacement'),
      booking('accepted', 'accepted'),
      booking('waiting', 'waiting_payment'),
      booking('down-payment', 'waiting_for_down_payment'),
      booking('processing', 'payment_processing'),
      booking('confirmed', 'confirmed'),
      booking('in_progress', 'in_progress'),
      booking('cancelled', 'cancelled'),
      booking('rejected', 'rejected'),
      booking('expired', 'expired'),
      booking('completed', 'completed'),
      booking('deleted', 'confirmed', deleted: true),
    ], DateTime.utc(2027, 2, 14));

    expect(
      result.map((b) => b.id).toList(),
      ['confirmed', 'in_progress'],
    );
  });
  test('pending and processing payments do not appear confirmed', () {
    expect(homeBookingStage('pending_provider_approval'), -1);
    expect(homeBookingStage('payment_processing'), 0);
    expect(homeBookingStage('confirmed'), 1);
    expect(homeBookingStage('in_progress'), 3);
  });
  testWidgets('progress card fits a narrow screen with large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: HomeBookingProgressCard(
                booking: booking('active', 'confirmed'),
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.text('Your upcoming event'), findsOneWidget);
    expect(find.text('Event journey'), findsOneWidget);
    expect(find.byKey(const ValueKey('booking-status-pill')), findsOneWidget);
    expect(find.text('Confirmed'), findsNWidgets(2));
    expect(find.text('Accepted'), findsOneWidget);
    expect(find.text('Preparation'), findsOneWidget);
    expect(find.text('Event day'), findsOneWidget);
    expect(find.byIcon(Icons.check), findsNWidgets(2));
    expect(find.text('CURRENT REFUND-POLICY STAGE'), findsOneWidget);
    expect(find.text('View booking policies'), findsOneWidget);
    expect(find.text('100%'), findsNothing);
    expect(find.text('Your event updates at a glance.'), findsOneWidget);
    expect(find.text('View booking details'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('only active cards render with the matching journey progress', (
    tester,
  ) async {
    final visible = homeActiveBookings([
      booking('confirmed', 'confirmed'),
      booking('in_progress', 'in_progress'),
      booking('cancelled', 'cancelled'),
      booking('rejected', 'rejected'),
      booking('request', 'pending_provider_approval'),
      booking('accepted', 'accepted'),
      booking('processing', 'payment_processing'),
    ], DateTime.utc(2027, 2, 14));
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: Column(children: [
            for (final item in visible) HomeBookingProgressCard(booking: item),
          ]),
        ),
      ),
    ));
    expect(find.byType(HomeBookingProgressCard), findsNWidgets(2));
    expect(find.text('Your upcoming event'), findsNWidgets(2));
    expect(find.text('Event journey'), findsNWidgets(2));
    expect(find.text('View booking details'), findsNWidgets(2));
    expect(find.text('In Progress'), findsOneWidget);
    expect(find.byIcon(Icons.check), findsNWidgets(6));
    expect(find.text('Cancelled'), findsNothing);
    expect(find.text('Rejected'), findsNothing);
    expect(find.text('Awaiting provider'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
