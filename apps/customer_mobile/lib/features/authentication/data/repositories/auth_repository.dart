import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../../core/constants/firestore_collections.dart';
import '../../../../core/constants/status_constants.dart';
import '../services/registration_rollback.dart';

class AuthRepository {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: 'asia-southeast1',
  );

  User? get currentUser => _auth.currentUser;

  Stream<User?> authStateChanges() => _auth.authStateChanges();

  Future<void> registerCustomer({
    required String firstName,
    required String lastName,
    required String email,
    required String phoneNumber,
    required String password,
  }) async {
    final normalizedEmail = email.trim().toLowerCase();

    try {
      final createdUser = await createIdentityAndProfile<User>(
        createIdentity: () async {
          final credential = await _auth.createUserWithEmailAndPassword(
            email: normalizedEmail,
            password: password,
          );
          final user = credential.user;
          if (user == null) {
            throw StateError(
              'Firebase Authentication did not return a user.',
            );
          }
          return user;
        },
        createProfile: (_) => _ensureCustomerProfile(
          firstName: firstName,
          lastName: lastName,
          phoneNumber: phoneNumber,
        ),
        rollbackIdentity: (user) => user.delete(),
        onProfileError: (error, stackTrace) {
          debugPrint('Customer profile creation failed: $error');
          debugPrintStack(stackTrace: stackTrace);
        },
        onRollbackError: (rollbackError, rollbackStackTrace) {
          debugPrint('Auth rollback failed: $rollbackError');
          debugPrintStack(stackTrace: rollbackStackTrace);
        },
      );

      // A mail delivery failure does not roll back a fully-created account.
      await createdUser.sendEmailVerification();
    } catch (error, stackTrace) {
      debugPrint('Customer registration failed: $error');
      debugPrintStack(stackTrace: stackTrace);
      rethrow;
    }
  }

  Future<bool> refreshEmailVerificationStatus() async {
    final user = _auth.currentUser;
    if (user == null) return false;

    await user.reload();
    final refreshedUser = _auth.currentUser;
    if (refreshedUser == null) return false;

    // Synchronize trusted profile metadata through Admin SDK code.
    await _syncUserAuthState();
    return refreshedUser.emailVerified;
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
    User? createdUser;

    try {
      final credential = await _auth.createUserWithEmailAndPassword(
        email: email.trim().toLowerCase(),
        password: password,
      );
      createdUser = credential.user;

      if (createdUser == null) {
        throw StateError('Firebase Authentication did not return a user.');
      }

      final ensureIdentity = _functions.httpsCallable(
        'ensureProviderIdentity',
      );
      await ensureIdentity.call(<String, dynamic>{
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        'phoneNumber': phoneNumber.trim(),
      });

      final callable = _functions.httpsCallable('registerProvider');
      await callable.call(<String, dynamic>{
        'ownerFirstName': firstName.trim(),
        'ownerLastName': lastName.trim(),
        'businessName': businessName.trim(),
        'businessPhone': businessPhone.trim(),
        'businessEmail': businessEmail.trim().toLowerCase(),
        'address': businessAddress.trim(),
        'city': city.trim(),
        'province': province.trim(),
        'description': description.trim(),
        'serviceAreas': serviceAreas,
        'eventTypesSupported': eventTypesSupported,
        'providerServiceType': providerServiceType,
        'providerCategory': providerCategory,
      });

      await createdUser.sendEmailVerification();
    } catch (error) {
      if (createdUser != null) {
        try {
          final userDoc = await _db
              .collection(FirestoreCollections.users)
              .doc(createdUser.uid)
              .get();
          if (!userDoc.exists) await createdUser.delete();
        } catch (_) {
          // Preserve the original registration error.
        }
      }
      rethrow;
    }
  }

  Future<void> sendCurrentUserEmailVerification() async {
    final user = _auth.currentUser;
    if (user == null) throw StateError('No user is currently logged in.');

    await user.reload();
    final refreshedUser = _auth.currentUser;
    if (refreshedUser == null) {
      throw StateError('No user is currently logged in.');
    }
    if (!refreshedUser.emailVerified) {
      await refreshedUser.sendEmailVerification();
    }
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    try {
      final credential = await _auth.signInWithEmailAndPassword(
        email: email.trim().toLowerCase(),
        password: password,
      );
      if (credential.user == null) {
        throw StateError('Unable to load the signed-in account.');
      }

      try {
        await _syncUserAuthState();
      } on FirebaseFunctionsException catch (error) {
        if (error.code != 'not-found') rethrow;
        await _ensureCustomerProfile();
        await _syncUserAuthState();
      }
      await _loadActiveProfile(credential.user!.uid);
    } catch (_) {
      await _auth.signOut();
      rethrow;
    }
  }

  Future<String?> providerVerificationStatusForOwner(String ownerId) async {
    try {
      final snapshot = await _db
          .collection(FirestoreCollections.providers)
          .where('ownerId', isEqualTo: ownerId)
          .limit(1)
          .get()
          .timeout(const Duration(seconds: 8));
      if (snapshot.docs.isEmpty) return null;

      final status = snapshot.docs.first.data()['verificationStatus'];
      return status is String ? status : ProviderVerificationStatus.draft;
    } catch (error, stackTrace) {
      debugPrint('Failed to load provider verification status: $error');
      debugPrintStack(stackTrace: stackTrace);
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Firebase sign-out must still run if the Google SDK has no session.
    }
    await _auth.signOut();
  }

  Future<void> signInWithGoogleAsCustomer() async {
    try {
      await GoogleSignIn.instance.initialize();
      final googleUser = await GoogleSignIn.instance.authenticate();
      final googleAuth = googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        idToken: googleAuth.idToken,
      );
      final userCredential = await _auth.signInWithCredential(credential);
      final user = userCredential.user;

      if (user == null) throw StateError('Google sign-in failed.');

      await _ensureCustomerProfile();
      await _loadActiveCustomerProfile(user.uid);
    } catch (_) {
      await logout();
      rethrow;
    }
  }

  Future<void> sendPasswordResetEmail({required String email}) async {
    final normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.isEmpty) {
      throw ArgumentError('Email address is required.');
    }
    await _auth.sendPasswordResetEmail(email: normalizedEmail);
  }

  Future<void> _ensureCustomerProfile({
    String? firstName,
    String? lastName,
    String? phoneNumber,
  }) async {
    final callable = _functions.httpsCallable('ensureUserProfile');
    await callable.call(<String, dynamic>{
      if (firstName != null) 'firstName': firstName.trim(),
      if (lastName != null) 'lastName': lastName.trim(),
      if (phoneNumber != null) 'phoneNumber': phoneNumber.trim(),
    });
  }

  Future<Map<String, dynamic>> _loadActiveCustomerProfile(String uid) async {
    final data = await _loadActiveProfile(uid);
    if (data['role'] != UserRoles.customer) {
      throw StateError('This sign-in is only available to customers.');
    }
    return data;
  }

  Future<Map<String, dynamic>> _loadActiveProfile(String uid) async {
    final snapshot = await _db
        .collection(FirestoreCollections.users)
        .doc(uid)
        .get();
    final data = snapshot.data();

    if (!snapshot.exists || data == null) {
      throw StateError('Your account profile could not be recovered.');
    }
    final accountStatus = data['accountStatus'] as String? ?? 'disabled';
    if (data['isBlocked'] == true || accountStatus == 'blocked') {
      throw StateError('This account has been blocked. Please contact support.');
    }
    if (data['isActive'] != true || accountStatus != 'active') {
      throw StateError('This account is currently disabled.');
    }
    return data;
  }

  Future<void> _syncUserAuthState() async {
    final callable = _functions.httpsCallable('syncUserAuthState');
    await callable.call<void>();
  }
}
