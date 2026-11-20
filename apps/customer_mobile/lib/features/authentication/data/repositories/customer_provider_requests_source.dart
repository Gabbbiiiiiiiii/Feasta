import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:rxdart/rxdart.dart';

import '../../../../core/constants/firestore_collections.dart';
import '../../../../shared/models/feasta_models.dart';

/// Customer-owned relationship reads for both legacy and independent bookings.
/// The booking owner is checked, but never supplies query authorization.
class CustomerProviderRequestsSource {
  CustomerProviderRequestsSource(this.db, this.auth);

  final FirebaseFirestore db;
  final FirebaseAuth auth;

  Stream<QuerySnapshot<Map<String, dynamic>>> watch(BookingModel booking) =>
      auth.authStateChanges().map((user) => user?.uid).distinct().switchMap((
        uid,
      ) {
        if (uid == null ||
            uid.isEmpty ||
            uid != auth.currentUser?.uid ||
            booking.customerId != uid ||
            booking.id.isEmpty) {
          return Stream<QuerySnapshot<Map<String, dynamic>>>.error(
            StateError('Sign in to view your booking requests.'),
          );
        }
        return db
            .collection(FirestoreCollections.providerRequests)
            .where('customerId', isEqualTo: uid)
            .where('mainEventId', isEqualTo: booking.id)
            .snapshots()
            .map((snapshot) {
              // Also reject a queued snapshot after a session transition.
              if (auth.currentUser?.uid != uid ||
                  snapshot.docs.any(
                    (doc) =>
                        doc.data()['customerId'] != uid ||
                        doc.data()['mainEventId'] != booking.id,
                  )) {
                throw StateError('Booking request ownership changed.');
              }
              return snapshot;
            });
      });
}

Stream<QuerySnapshot<Map<String, dynamic>>> watchCustomerProviderRequests(
  BookingModel booking,
) => CustomerProviderRequestsSource(
  FirebaseFirestore.instance,
  FirebaseAuth.instance,
).watch(booking);
