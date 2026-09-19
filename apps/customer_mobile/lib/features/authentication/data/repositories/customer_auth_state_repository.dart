import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:rxdart/rxdart.dart';

import '../../../../core/constants/firestore_collections.dart';
import '../../../../core/security/secure_debug_log.dart';
import '../../domain/auth_account_state.dart';

class CustomerAuthIdentity {
  const CustomerAuthIdentity({
    required this.uid,
    required this.email,
    required this.emailVerified,
  });

  final String uid;
  final String? email;
  final bool emailVerified;
}

class CustomerAccountLoadResult {
  const CustomerAccountLoadResult({
    required this.identity,
    required this.userProfile,
  });

  final CustomerAuthIdentity identity;
  final AuthenticationUserProfileInput? userProfile;
}

enum CustomerAuthLoadFailureKind {
  network,
  authorization,
  sessionExpired,
  disabledAuthAccount,
  configuration,
  server,
}

class CustomerAuthLoadFailure implements Exception {
  const CustomerAuthLoadFailure(this.kind);

  final CustomerAuthLoadFailureKind kind;
}

abstract interface class CustomerAuthStateRepository {
  Stream<CustomerAuthIdentity?> authStateChanges();

  Stream<CustomerAuthIdentity?> idTokenChanges();

  Stream<void> accountChanges(String uid);

  CustomerAuthIdentity? get currentIdentity;

  Future<CustomerAccountLoadResult> loadAccount({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  });

  Future<void> signOut();
}

class FirebaseCustomerAuthStateRepository
    implements CustomerAuthStateRepository {
  FirebaseCustomerAuthStateRepository({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
  }) : _auth = auth ?? FirebaseAuth.instance,
       _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;

  @override
  CustomerAuthIdentity? get currentIdentity => _identity(_auth.currentUser);

  @override
  Stream<CustomerAuthIdentity?> authStateChanges() {
    return _auth.authStateChanges().map(_identity);
  }

  @override
  Stream<CustomerAuthIdentity?> idTokenChanges() {
    return _auth.idTokenChanges().map(_identity);
  }

  @override
  Stream<void> accountChanges(String uid) {
    final userChanges = _firestore
        .collection(FirestoreCollections.users)
        .doc(uid)
        .snapshots()
        .map<void>((_) {});
    final customerChanges = _firestore
        .collection(FirestoreCollections.customers)
        .doc(uid)
        .snapshots()
        .map<void>((_) {});
    return MergeStream<void>([userChanges, customerChanges]);
  }

  @override
  Future<CustomerAccountLoadResult> loadAccount({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  }) async {
    try {
      final user = _auth.currentUser;
      if (user == null || user.uid != identity.uid) {
        throw const CustomerAuthLoadFailure(
          CustomerAuthLoadFailureKind.sessionExpired,
        );
      }

      await user.reload();
      final refreshedUser = _auth.currentUser;
      if (refreshedUser == null || refreshedUser.uid != identity.uid) {
        throw const CustomerAuthLoadFailure(
          CustomerAuthLoadFailureKind.sessionExpired,
        );
      }
      await refreshedUser.getIdToken(forceTokenRefresh);

      final userSnapshot = await _firestore
          .collection(FirestoreCollections.users)
          .doc(identity.uid)
          .get();
      final userData = userSnapshot.data();
      if (!userSnapshot.exists || userData == null) {
        return CustomerAccountLoadResult(
          identity: _identity(refreshedUser)!,
          userProfile: null,
        );
      }

      if (userData['role'] == 'customer') {
        final customerSnapshot = await _firestore
            .collection(FirestoreCollections.customers)
            .doc(identity.uid)
            .get();
        if (!customerSnapshot.exists) {
          return CustomerAccountLoadResult(
            identity: _identity(refreshedUser)!,
            userProfile: null,
          );
        }
      }

      return CustomerAccountLoadResult(
        identity: _identity(refreshedUser)!,
        userProfile: AuthenticationUserProfileInput(
          role: userData['role'],
          accountStatus: userData['accountStatus'],
          isActive: userData['isActive'],
          isBlocked: userData['isBlocked'],
          isPhoneVerified: userData['isPhoneVerified'],
          providerId: userData['providerId'],
        ),
      );
    } on CustomerAuthLoadFailure {
      rethrow;
    } on FirebaseAuthException catch (error, stackTrace) {
      secureDebugLog(
        'Authentication state refresh failed with code ${error.code}',
        error: error,
        stackTrace: stackTrace,
      );
      throw CustomerAuthLoadFailure(_authFailureKind(error.code));
    } on FirebaseException catch (error, stackTrace) {
      secureDebugLog(
        'Account profile load failed with code ${error.code}',
        error: error,
        stackTrace: stackTrace,
      );
      throw CustomerAuthLoadFailure(_firebaseFailureKind(error.code));
    } catch (error, stackTrace) {
      secureDebugLog(
        'Account state load failed',
        error: error,
        stackTrace: stackTrace,
      );
      throw const CustomerAuthLoadFailure(CustomerAuthLoadFailureKind.server);
    }
  }

  @override
  Future<void> signOut() async {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Firebase sign-out remains authoritative when no Google session exists.
    }
    await _auth.signOut();
  }

  static CustomerAuthIdentity? _identity(User? user) {
    if (user == null) return null;
    return CustomerAuthIdentity(
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
    );
  }

  static CustomerAuthLoadFailureKind _authFailureKind(String code) {
    return switch (code) {
      'user-disabled' => CustomerAuthLoadFailureKind.disabledAuthAccount,
      'id-token-revoked' ||
      'user-token-expired' ||
      'invalid-user-token' => CustomerAuthLoadFailureKind.sessionExpired,
      'network-request-failed' => CustomerAuthLoadFailureKind.network,
      _ => CustomerAuthLoadFailureKind.server,
    };
  }

  static CustomerAuthLoadFailureKind _firebaseFailureKind(String code) {
    return switch (code) {
      'permission-denied' => CustomerAuthLoadFailureKind.authorization,
      'unavailable' ||
      'deadline-exceeded' => CustomerAuthLoadFailureKind.network,
      'failed-precondition' => CustomerAuthLoadFailureKind.configuration,
      _ => CustomerAuthLoadFailureKind.server,
    };
  }
}
