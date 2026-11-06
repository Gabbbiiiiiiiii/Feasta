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
      expect(result.map((b) => b.id), ['pending', 'later']);
      expect(homeActiveBookings([], DateTime.now()), isEmpty);
    },
  );
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
    expect(find.text('Booking timeline'), findsOneWidget);
    expect(find.text('View booking details'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
