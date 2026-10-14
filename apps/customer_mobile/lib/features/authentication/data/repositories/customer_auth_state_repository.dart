import 'package:cloud_functions/cloud_functions.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:rxdart/rxdart.dart';

import '../../../../core/security/auth_operation_coordinator.dart';
import '../../../../core/constants/firestore_collections.dart';
import '../../../../core/security/secure_debug_log.dart';
import '../../../../core/enums/enums.dart';
import '../../domain/auth_account_state.dart';
import '../services/customer_profile_bootstrap.dart';

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
  consentRequired,
  network,
  authorization,
  blocked,
  unsupportedRole,
  accountAccess,
  callableAccess,
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

abstract interface class CustomerConsentRepository {
  Future<void> acceptConsent(String uid);
}

class FirebaseCustomerAuthStateRepository
    implements CustomerAuthStateRepository, CustomerConsentRepository {
  FirebaseCustomerAuthStateRepository({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
    CustomerBootstrapCall? callable,
    Future<void> Function()? googleSignOut,
  }) : _auth = auth ?? FirebaseAuth.instance,
       _firestore = firestore ?? FirebaseFirestore.instance,
       _googleSignOut =
           googleSignOut ?? (() => GoogleSignIn.instance.signOut()),
       _call =
           callable ??
           ((name, data) async {
             await (functions ??
                     FirebaseFunctions.instanceFor(region: 'asia-southeast1'))
                 .httpsCallable(name)
                 .call<void>(data);
           }) {
    // The first restored-session replay is not an identity transition.
    _observedUid = _auth.currentUser?.uid;
  }
  final CustomerBootstrapCall _call;
  final Future<void> Function() _googleSignOut;
  String? _bootstrappedUid;
  int _sessionGeneration = 0;
  String? _observedUid;

  @override
  Future<void> acceptConsent(String uid) {
    final generation = _sessionGeneration;
    return AuthOperationCoordinator.shared.run(() async {
      _requireIdentity(uid);
      if (generation != _sessionGeneration) return;
      try {
        await _call('ensureUserProfile', {
          'acceptedTerms': true,
          'acceptedPrivacy': true,
          'termsPolicyVersion': '2026-07-29',
          'privacyPolicyVersion': '2026-07-29',
        });
      } on FirebaseFunctionsException catch (error) {
        throw CustomerAuthLoadFailure(_callableFailureKind(error));
      }
      _requireIdentity(uid);
      if (generation != _sessionGeneration) return;
      _bootstrappedUid = uid;
    });
  }

  void _requireIdentity(String uid) {
    if (_auth.currentUser?.uid != uid) {
      throw const CustomerAuthLoadFailure(CustomerAuthLoadFailureKind.server);
    }
  }

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;

  @override
  CustomerAuthIdentity? get currentIdentity => _identity(_auth.currentUser);

  @override
  Stream<CustomerAuthIdentity?> authStateChanges() {
    return _auth.authStateChanges().map((user) {
      if (_observedUid != user?.uid) {
        _observedUid = user?.uid;
        _sessionGeneration++;
        _bootstrappedUid = null;
      }
      return _identity(user);
    });
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
  }) {
    final generation = _sessionGeneration;
    return AuthOperationCoordinator.shared.run(() {
      if (generation != _sessionGeneration) {
        throw const CustomerAuthLoadFailure(CustomerAuthLoadFailureKind.server);
      }
      return _loadAccountCoordinated(
        identity: identity,
        forceTokenRefresh: forceTokenRefresh,
      );
    });
  }

  Future<CustomerAccountLoadResult> _loadAccountCoordinated({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  }) async {
    final generation = _sessionGeneration;
    void checkCurrent() {
      _requireIdentity(identity.uid);
      if (generation != _sessionGeneration) {
        throw const CustomerAuthLoadFailure(CustomerAuthLoadFailureKind.server);
      }
    }

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

      checkCurrent();
      await refreshedUser.getIdToken(forceTokenRefresh);

      final latestUser = _auth.currentUser;

      if (latestUser == null || latestUser.uid != identity.uid) {
        throw const CustomerAuthLoadFailure(
          CustomerAuthLoadFailureKind.sessionExpired,
        );
      }

      checkCurrent();
      if (_bootstrappedUid != identity.uid) {
        await CustomerProfileBootstrap(
          call: _call,
          checkCurrent: () => checkCurrent(),
        ).synchronize();
        checkCurrent();
        _bootstrappedUid = identity.uid;
      }

      final userSnapshot = await _firestore
          .collection(FirestoreCollections.users)
          .doc(identity.uid)
          .get();

      checkCurrent();
      final userData = userSnapshot.data();

      if (!userSnapshot.exists || userData == null) {
        return CustomerAccountLoadResult(
          identity: _identity(latestUser)!,
          userProfile: null,
        );
      }

      final profile = AuthenticationUserProfileInput(
        role: userData['role'],
        accountStatus: userData['accountStatus'],
        isActive: userData['isActive'],
        isBlocked: userData['isBlocked'],
        isPhoneVerified: userData['isPhoneVerified'],
        providerId: userData['providerId'],
      );
      final prerequisite = resolveAuthenticationGate(
        AuthenticationGateInput(
          authenticated: true,
          // Verification routing follows profile availability. This check
          // establishes only the trusted role and account prerequisites.
          emailVerified: true,
          userProfile: profile,
          requiredRoles: const {UserRole.customer},
        ),
      );
      if (prerequisite.kind == AuthenticationGateKind.customerReady ||
          prerequisite.kind ==
              AuthenticationGateKind.customerPhoneVerificationRequired) {
        final customerSnapshot = await _firestore
            .collection(FirestoreCollections.customers)
            .doc(identity.uid)
            .get();

        checkCurrent();
        if (!customerSnapshot.exists) {
          await _call('ensureUserProfile', null);
          checkCurrent();
          final repaired = await _firestore
              .collection(FirestoreCollections.customers)
              .doc(identity.uid)
              .get();
          checkCurrent();
          if (!repaired.exists) {
            throw const CustomerAuthLoadFailure(
              CustomerAuthLoadFailureKind.server,
            );
          }
        }
      }

      return CustomerAccountLoadResult(
        identity: _identity(latestUser)!,
        userProfile: profile,
      );
    } on CustomerAuthLoadFailure {
      rethrow;
    } on FirebaseFunctionsException catch (error) {
      throw CustomerAuthLoadFailure(_callableFailureKind(error));
    } on FirebaseAuthException catch (error, stackTrace) {
      secureDebugLog(
        'Authentication state refresh failed with code ${error.code}',
        stackTrace: stackTrace,
      );

      throw CustomerAuthLoadFailure(_authFailureKind(error.code));
    } on FirebaseException catch (error, stackTrace) {
      secureDebugLog(
        'Account profile load failed with code ${error.code}',
        stackTrace: stackTrace,
      );

      throw CustomerAuthLoadFailure(_firebaseFailureKind(error.code));
    } catch (error, stackTrace) {
      secureDebugLog('Account state load failed', stackTrace: stackTrace);

      throw const CustomerAuthLoadFailure(CustomerAuthLoadFailureKind.server);
    }
  }

  @override
  Future<void> signOut() {
    _sessionGeneration++;
    _bootstrappedUid = null;
    final uid = _auth.currentUser?.uid;
    final generation = _sessionGeneration;
    return AuthOperationCoordinator.shared.transition(() async {
      bool isCurrent() =>
          _auth.currentUser?.uid == uid && _sessionGeneration == generation;
      if (!isCurrent()) return;
      try {
        await _googleSignOut();
      } catch (_) {
        // Firebase sign-out remains authoritative if Google has no session.
      }
      if (!isCurrent()) return;
      await _auth.signOut();
    });
  }

  static CustomerAuthIdentity? _identity(User? user) {
    if (user == null) {
      return null;
    }

    return CustomerAuthIdentity(
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
    );
  }

  static CustomerAuthLoadFailureKind _callableFailureKind(
    FirebaseFunctionsException error,
  ) {
    final details = error.details;
    final reason = details is Map ? details['reason'] : null;
    if (reason == 'consent-required') {
      return CustomerAuthLoadFailureKind.consentRequired;
    }
    if (reason == 'blocked') return CustomerAuthLoadFailureKind.blocked;
    if (reason == 'disabled') {
      return CustomerAuthLoadFailureKind.disabledAuthAccount;
    }
    if (reason == 'unsupported-role') {
      return CustomerAuthLoadFailureKind.unsupportedRole;
    }
    // syncUserAuthState provides explicit restrictions without reason details.
    if (error.code == 'permission-denied') {
      if (error.message == 'This account is blocked or disabled.') {
        return CustomerAuthLoadFailureKind.blocked;
      }
      if (error.message == 'This account is disabled.') {
        return CustomerAuthLoadFailureKind.disabledAuthAccount;
      }
      if (error.message == 'Account role is invalid.') {
        return CustomerAuthLoadFailureKind.authorization;
      }
    }
    // A callable rejection may be Auth or App Check enforcement. Without an
    // explicit security reason it proves neither a missing profile nor an
    // expired Firebase session. Firestore access errors stay separate.
    if (error.code == 'permission-denied' || error.code == 'unauthenticated') {
      return CustomerAuthLoadFailureKind.callableAccess;
    }
    return _firebaseFailureKind(error.code);
  }

  static CustomerAuthLoadFailureKind _authFailureKind(String code) {
    return switch (code) {
      'no-current-user' ||
      'id-token-revoked' ||
      'user-token-expired' ||
      'invalid-user-token' => CustomerAuthLoadFailureKind.sessionExpired,
      'user-disabled' => CustomerAuthLoadFailureKind.disabledAuthAccount,
      'network-request-failed' => CustomerAuthLoadFailureKind.network,
      _ => CustomerAuthLoadFailureKind.server,
    };
  }

  static CustomerAuthLoadFailureKind _firebaseFailureKind(String code) {
    return switch (code) {
      'permission-denied' => CustomerAuthLoadFailureKind.accountAccess,
      'unavailable' ||
      'deadline-exceeded' => CustomerAuthLoadFailureKind.network,
      'failed-precondition' => CustomerAuthLoadFailureKind.configuration,
      _ => CustomerAuthLoadFailureKind.server,
    };
  }
}
