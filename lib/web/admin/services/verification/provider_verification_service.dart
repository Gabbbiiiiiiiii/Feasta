import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:feasta/core/constants/firestore_collections.dart';
import 'package:feasta/core/constants/status_constants.dart';

class ProviderVerificationService {
  ProviderVerificationService({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  Future<void> approveVerification({
    required String verificationId,
    required String providerId,
  }) async {
    final admin = _auth.currentUser;

    if (admin == null) {
      throw Exception('No administrator is currently signed in.');
    }

    final verificationRef = _firestore
        .collection(FirestoreCollections.providerVerifications)
        .doc(verificationId);

    final providerRef = _firestore
        .collection(FirestoreCollections.providers)
        .doc(providerId);

    final adminLogRef = _firestore
        .collection(FirestoreCollections.adminLogs)
        .doc();

    final batch = _firestore.batch();
    final now = FieldValue.serverTimestamp();

    batch.update(verificationRef, {
      'status': ProviderVerificationRequestStatus.approved,
      'reviewedAt': now,
      'reviewedBy': admin.uid,
      'rejectionReason': null,
      'updatedAt': now,
    });

    batch.update(providerRef, {
      'verificationStatus': ProviderVerificationStatus.verified,
      'isActive': true,
      'updatedAt': now,
    });

    batch.set(adminLogRef, {
      'action': 'provider_verification_approved',
      'actorId': admin.uid,
      'entity': 'provider',
      'entityId': providerId,
      'details': {
        'verificationId': verificationId,
      },
      'createdAt': now,
    });

    await batch.commit();
  }
}