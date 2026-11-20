import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../../core/constants/firestore_collections.dart';
import '../../../../shared/models/feasta_models.dart';
import '../../../customer/customer_bookings_controller.dart';

class FirestoreCustomerBookingsSource implements CustomerBookingsSource {
  FirestoreCustomerBookingsSource(this.db, this.auth);
  final FirebaseFirestore db;
  final FirebaseAuth auth;
  @override
  String? get currentUid => auth.currentUser?.uid;
  @override
  Stream<String?> get accounts =>
      auth.authStateChanges().map((u) => u?.uid).distinct();

  @override
  Stream<CustomerBookingsPage> watch(String uid, Object? cursor) {
    if (uid.isEmpty || uid != currentUid) {
      return Stream.error(StateError('Please log in to view bookings.'));
    }
    var query = db
        .collection(FirestoreCollections.mainEvents)
        .where('customerId', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true);
    if (cursor != null) {
      query = query.startAfterDocument(
        cursor as DocumentSnapshot<Map<String, dynamic>>,
      );
    }
    return query
        .limit(21)
        .snapshots(includeMetadataChanges: true)
        // Cached partial pages cannot establish a reliable end-of-list.
        .where((s) => !s.metadata.isFromCache && !s.metadata.hasPendingWrites)
        .map((snapshot) {
          if (uid != currentUid) throw StateError('Account changed.');
          final docs = snapshot.docs.take(20).toList();
          return CustomerBookingsPage(
            docs.map(BookingModel.fromDoc).toList(),
            docs.isEmpty ? null : docs.last,
            snapshot.docs.length > 20,
          );
        });
  }
}
