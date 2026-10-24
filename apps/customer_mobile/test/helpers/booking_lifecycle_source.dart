// Offline relationship evidence for presentation tests; production still reads
// Firestore. Keep the real lifecycle builder and its ownership filters active.
// Firestore supplies no public constructor for its immutable snapshots.
// ignore_for_file: subtype_of_sealed_class
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:feasta/features/customer/booking_lifecycle_presentation.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

class _LifecycleDocument extends Fake
    implements QueryDocumentSnapshot<Map<String, dynamic>> {
  _LifecycleDocument(this.id, this.fields);
  @override
  final String id;
  final Map<String, dynamic> fields;
  @override
  Map<String, dynamic> data() => fields;
}

class _LifecycleSnapshot extends Fake
    implements QuerySnapshot<Map<String, dynamic>> {
  _LifecycleSnapshot(this.docs);
  @override
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs;
}

Stream<QuerySnapshot<Map<String, dynamic>>> fixtureLifecycleSource(
  BookingModel booking,
) => Stream.value(
  _LifecycleSnapshot([
    for (final id in booking.providerRequestIds)
      _LifecycleDocument(id, {
        'providerRequestId': id,
        'mainEventId': booking.id,
        'bookingId': booking.id,
        'customerId': booking.customerId,
        'status': booking.status,
      }),
  ]),
);

Future<void> pumpWithBookingLifecycle(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    BookingLifecycleScope(source: fixtureLifecycleSource, child: child),
  );
  await tester.pump();
}
