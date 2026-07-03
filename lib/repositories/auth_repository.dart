import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../core/constants/firestore_collections.dart';
import '../core/constants/status_constants.dart';

class AuthRepository {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  User? get currentUser => _auth.currentUser;

  Stream<User?> authStateChanges() {
    return _auth.authStateChanges();
  }

  Future<void> registerCustomer({
    required String firstName,
    required String lastName,
    required String email,
    required String phoneNumber,
    required String password,
  }) async {
    final credential = await _auth.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password.trim(),
    );

    final user = credential.user;

    if (user == null) {
      throw Exception('Failed to create customer account.');
    }

    final uid = user.uid;
    final now = FieldValue.serverTimestamp();

    final batch = _db.batch();

    final userRef = _db.collection(FirestoreCollections.users).doc(uid);
    final customerRef = _db.collection(FirestoreCollections.customers).doc(uid);

    batch.set(userRef, {
      'uid': uid,
      'firstName': firstName.trim(),
      'lastName': lastName.trim(),
      'email': email.trim(),
      'phoneNumber': phoneNumber.trim(),
      'role': UserRoles.customer,
      'profileImageUrl': null,
      'isEmailVerified': user.emailVerified,
      'isPhoneVerified': false,
      'isActive': true,
      'isBlocked': false,
      'createdAt': now,
      'updatedAt': now,
      'lastLoginAt': now,
    });

    batch.set(customerRef, {
      'userId': uid,
      'firstName': firstName.trim(),
      'lastName': lastName.trim(),
      'email': email.trim(),
      'phoneNumber': phoneNumber.trim(),
      'address': '',
      'city': 'Ormoc City',
      'province': 'Leyte',
      'profileImageUrl': null,
      'totalBookings': 0,
      'completedBookings': 0,
      'cancelledBookings': 0,
      'isActive': true,
      'createdAt': now,
      'updatedAt': now,
    });

    await batch.commit();

    await user.sendEmailVerification();

    await userRef.update({
      'isEmailVerified': false,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> registerProvider({
    required String firstName,
    required String lastName,
    required String email,
    required String phoneNumber,
    required String password,
    required String businessName,
    required String businessPhone,
    required String businessEmail,
    required String businessAddress,
    required String city,
    required String province,
    required String description,
    required List<String> serviceAreas,
    required List<String> eventTypesSupported,
    required String providerServiceType,
    required String providerCategory,
  }) async {
    final credential = await _auth.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password.trim(),
    );

    final user = credential.user;

    if (user == null) {
      throw Exception('Failed to create provider account.');
    }

    final uid = user.uid;
    final now = FieldValue.serverTimestamp();

    final providerRef = _db.collection(FirestoreCollections.providers).doc();
    final verificationRef =
        _db.collection(FirestoreCollections.providerVerifications).doc();

    final batch = _db.batch();

    final userRef = _db.collection(FirestoreCollections.users).doc(uid);

    batch.set(userRef, {
      'uid': uid,
      'firstName': firstName.trim(),
      'lastName': lastName.trim(),
      'email': email.trim(),
      'phoneNumber': phoneNumber.trim(),
      'role': UserRoles.provider,
      'profileImageUrl': null,
      'isEmailVerified': user.emailVerified,
      'isPhoneVerified': false,
      'isActive': true,
      'isBlocked': false,
      'createdAt': now,
      'updatedAt': now,
      'lastLoginAt': now,
    });

    batch.set(providerRef, {
      'ownerId': uid,
      'businessName': businessName.trim(),
      'businessEmail': businessEmail.trim(),
      'businessPhone': businessPhone.trim(),
      'ownerFirstName': firstName.trim(),
      'ownerLastName': lastName.trim(),
      'description': description.trim(),
      'location': '$city, $province',
      'address': businessAddress.trim(),
      'city': city.trim(),
      'province': province.trim(),
      'coverImageUrl': null,
      'logoUrl': null,
      'serviceAreas': serviceAreas,
      'eventTypesSupported': eventTypesSupported,
      'providerServiceType': providerServiceType,
      'providerCategory': providerCategory,
      'minPrice': 0,
      'maxPrice': 0,
      'ratingAverage': 0,
      'reviewCount': 0,
      'totalCompletedBookings': 0,
      'totalViews': 0,
      'favoriteCount': 0,
      'verificationStatus': ProviderVerificationStatus.pending,
      'businessPermitUrl': null,
      'validIdUrl': null,
      'birDocumentUrl': null,
      'dtiDocumentUrl': null,
      'maxEventsPerDay': 1,
      'availableStaffCount': 0,
      'availableEquipmentCount': 0,
      'acceptsMultipleEventsPerDay': false,
      'isActive': true,
      'isFeatured': false,
      'createdAt': now,
      'updatedAt': now,
    });

    batch.set(verificationRef, {
      'providerId': providerRef.id,
      'ownerId': uid,
      'businessName': businessName.trim(),
      'providerServiceType': providerServiceType,
      'businessPermitUrl': null,
      'validIdUrl': null,
      'birDocumentUrl': null,
      'dtiDocumentUrl': null,
      'status': ProviderVerificationRequestStatus.pending,
      'submittedAt': now,
      'reviewedAt': null,
      'reviewedBy': null,
      'rejectionReason': null,
      'createdAt': now,
      'updatedAt': now,
    });

    await batch.commit();

    await user.sendEmailVerification();

    await userRef.update({
      'isEmailVerified': false,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> sendCurrentUserEmailVerification() async {
    final user = _auth.currentUser;

    if (user == null) {
      throw Exception('No user is currently logged in.');
    }

    await user.reload();

    final refreshedUser = _auth.currentUser;

    if (refreshedUser == null) {
      throw Exception('No user is currently logged in.');
    }

    if (refreshedUser.emailVerified) {
      return;
    }

    await refreshedUser.sendEmailVerification();
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    await _auth.signInWithEmailAndPassword(
      email: email.trim(),
      password: password.trim(),
    );
  }

  Future<String?> providerVerificationStatusForOwner(String ownerId) async {
    try {
      final snapshot = await _db
          .collection(FirestoreCollections.providers)
          .where('ownerId', isEqualTo: ownerId)
          .limit(1)
          .get()
          .timeout(const Duration(seconds: 8));

      if (snapshot.docs.isEmpty) {
        return null;
      }

      final status = snapshot.docs.first.data()['verificationStatus'];
      return status is String ? status : ProviderVerificationStatus.pending;
    } catch (error, stackTrace) {
      debugPrint('Failed to load provider verification status: $error');
      debugPrint(stackTrace.toString());
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await GoogleSignIn.instance.disconnect();
    } catch (_) {
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {}
    }

    await _auth.signOut();
  }

  Future<void> signInWithGoogleAsCustomer() async {
    await GoogleSignIn.instance.initialize();

    final GoogleSignInAccount googleUser =
        await GoogleSignIn.instance.authenticate();

    final GoogleSignInAuthentication googleAuth = googleUser.authentication;

    final credential = GoogleAuthProvider.credential(
      idToken: googleAuth.idToken,
    );

    final userCredential = await _auth.signInWithCredential(credential);
    final user = userCredential.user;

    if (user == null) {
      throw Exception('Google sign-in failed.');
    }

    final uid = user.uid;
    final now = FieldValue.serverTimestamp();

    final userRef = _db.collection(FirestoreCollections.users).doc(uid);
    final customerRef = _db.collection(FirestoreCollections.customers).doc(uid);

    final userDoc = await userRef.get();

    if (!userDoc.exists) {
      final displayName = user.displayName ?? '';
      final nameParts = displayName.trim().split(' ');

      final firstName = nameParts.isNotEmpty && nameParts.first.isNotEmpty
          ? nameParts.first
          : 'Customer';

      final lastName =
          nameParts.length > 1 ? nameParts.sublist(1).join(' ') : '';

      final batch = _db.batch();

      batch.set(userRef, {
        'uid': uid,
        'firstName': firstName,
        'lastName': lastName,
        'email': user.email ?? googleUser.email,
        'phoneNumber': user.phoneNumber ?? '',
        'role': UserRoles.customer,
        'profileImageUrl': user.photoURL,
        'isEmailVerified': user.emailVerified,
        'isPhoneVerified': false,
        'isActive': true,
        'isBlocked': false,
        'createdAt': now,
        'updatedAt': now,
        'lastLoginAt': now,
        'authProvider': 'google',
      });

      batch.set(customerRef, {
        'userId': uid,
        'firstName': firstName,
        'lastName': lastName,
        'email': user.email ?? googleUser.email,
        'phoneNumber': user.phoneNumber ?? '',
        'address': '',
        'city': 'Ormoc City',
        'province': 'Leyte',
        'profileImageUrl': user.photoURL,
        'totalBookings': 0,
        'completedBookings': 0,
        'cancelledBookings': 0,
        'isActive': true,
        'createdAt': now,
        'updatedAt': now,
      });

      await batch.commit();
    } else {
      final data = userDoc.data();
      final role = data?['role'];

      if (role != UserRoles.customer) {
        await logout();
        throw Exception(
          'Google sign-in is only available for customer accounts.',
        );
      }

      await userRef.update({
        'lastLoginAt': now,
        'updatedAt': now,
        'authProvider': 'google',
      });
    }
  }

  Future<void> sendPasswordResetEmail({
    required String email,
  }) async {
    await _auth.sendPasswordResetEmail(
      email: email.trim(),
    );
  }
}
