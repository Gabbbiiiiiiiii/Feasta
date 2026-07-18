import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../../core/constants/firestore_collections.dart';
import '../../../../core/constants/status_constants.dart';
import '../../domain/account_recovery.dart';
import '../../domain/customer_login.dart';
import '../../domain/customer_registration.dart';
import '../services/registration_rollback.dart';
import '../../../../core/security/secure_debug_log.dart';

class AuthRepository
    implements
        CustomerRegistrationGateway,
        CustomerLoginGateway,
        EmailVerificationGateway,
        PasswordResetGateway,
        FirebaseActionCodeGateway {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: 'asia-southeast1',
  );

  User? get currentUser => _auth.currentUser;

  Stream<User?> authStateChanges() => _auth.authStateChanges();

  @override
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput rawInput,
  ) async {
    final input = rawInput.normalized();
    final normalizedEmail = input.email;

    try {
      final signedInUser = _auth.currentUser;
      final recoverExisting =
          signedInUser != null &&
          signedInUser.email?.trim().toLowerCase() == normalizedEmail;
      if (signedInUser != null && !recoverExisting) {
        throw const CustomerRegistrationException(
          CustomerRegistrationFailureKind.emailAlreadyInUse,
        );
      }

      final user = recoverExisting
          ? signedInUser
          : await createIdentityAndProfile<User>(
              createIdentity: () async {
                final credential = await _auth.createUserWithEmailAndPassword(
                  email: normalizedEmail,
                  password: input.password,
                );
                final created = credential.user;
                if (created == null) {
                  throw StateError(
                    'Firebase Authentication did not return a user.',
                  );
                }
                return created;
              },
              createProfile: (_) => _ensureCustomerProfile(
                firstName: input.firstName,
                lastName: input.lastName,
                phoneNumber: input.phoneNumber,
                acceptedTerms: input.acceptedTerms,
                acceptedPrivacy: input.acceptedPrivacy,
              ),
              rollbackIdentity: (created) => created.delete(),
              onProfileError: (error, stackTrace) {
                secureDebugLog(
                  'Customer profile creation failed',
                  error: error,
                  stackTrace: stackTrace,
                );
              },
              onRollbackError: (rollbackError, rollbackStackTrace) {
                secureDebugLog(
                  'Auth rollback failed',
                  error: rollbackError,
                  stackTrace: rollbackStackTrace,
                );
              },
            );

      if (recoverExisting) {
        await _ensureCustomerProfile(
          firstName: input.firstName,
          lastName: input.lastName,
          phoneNumber: input.phoneNumber,
          acceptedTerms: input.acceptedTerms,
          acceptedPrivacy: input.acceptedPrivacy,
        );
      }

      // A mail delivery failure does not roll back a fully-created account.
      var verificationEmailSent = true;
      try {
        if (!user.emailVerified) await user.sendEmailVerification();
      } catch (error, stackTrace) {
        verificationEmailSent = false;
        secureDebugLog(
          'Verification email delivery failed after registration',
          error: error,
          stackTrace: stackTrace,
        );
      }
      return CustomerRegistrationResult(
        email: normalizedEmail,
        verificationEmailSent: verificationEmailSent,
        recoveredExistingIdentity: recoverExisting,
      );
    } on CustomerRegistrationException {
      rethrow;
    } catch (error, stackTrace) {
      secureDebugLog(
        'Customer registration failed',
        error: error,
        stackTrace: stackTrace,
      );
      throw CustomerRegistrationException(_registrationFailureKind(error));
    }
  }

  @override
  Future<bool> refreshVerification() async {
    final user = _auth.currentUser;
    if (user == null) {
      throw const AccountRecoveryException(
        AccountRecoveryFailureKind.sessionExpired,
      );
    }
    try {
      await user.reload();
      final refreshedUser = _auth.currentUser;
      if (refreshedUser == null) {
        throw const AccountRecoveryException(
          AccountRecoveryFailureKind.sessionExpired,
        );
      }
      await refreshedUser.getIdToken(true);
      await _syncUserAuthState();
      return refreshedUser.emailVerified;
    } on AccountRecoveryException {
      rethrow;
    } catch (error) {
      throw AccountRecoveryException(_recoveryFailureKind(error));
    }
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

      final ensureIdentity = _functions.httpsCallable('ensureProviderIdentity');
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

  @override
  Future<void> resendVerification() async {
    final user = _auth.currentUser;
    if (user == null) {
      throw const AccountRecoveryException(
        AccountRecoveryFailureKind.sessionExpired,
      );
    }

    try {
      await user.reload();
      final refreshedUser = _auth.currentUser;
      if (refreshedUser == null) {
        throw const AccountRecoveryException(
          AccountRecoveryFailureKind.sessionExpired,
        );
      }
      if (!refreshedUser.emailVerified) {
        await refreshedUser.sendEmailVerification();
      }
    } on AccountRecoveryException {
      rethrow;
    } catch (error) {
      throw AccountRecoveryException(_recoveryFailureKind(error));
    }
  }

  @override
  Future<CustomerLoginResult> signInWithEmail({
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
      await _loadActiveCustomerProfile(credential.user!.uid);
      await credential.user!.getIdToken(true);
      return CustomerLoginResult(
        uid: credential.user!.uid,
        email: credential.user!.email,
        emailVerified: credential.user!.emailVerified,
      );
    } on CustomerLoginException {
      await _auth.signOut();
      rethrow;
    } catch (error) {
      await _auth.signOut();
      throw CustomerLoginException(_loginFailureKind(error));
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
      secureDebugLog(
        'Failed to load provider verification status',
        error: error,
        stackTrace: stackTrace,
      );
      return null;
    }
  }

  @override
  Future<void> logout() async {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Firebase sign-out must still run if the Google SDK has no session.
    }
    await _auth.signOut();
  }

  @override
  Future<CustomerLoginResult> signInWithGoogle() async {
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
      await user.getIdToken(true);
      return CustomerLoginResult(
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
      );
    } on GoogleSignInException catch (error) {
      await logout();
      if (error.code == GoogleSignInExceptionCode.canceled) {
        throw const CustomerLoginException(CustomerLoginFailureKind.cancelled);
      }
      throw const CustomerLoginException(CustomerLoginFailureKind.unknown);
    } on CustomerLoginException {
      await logout();
      rethrow;
    } catch (error) {
      await logout();
      throw CustomerLoginException(_loginFailureKind(error));
    }
  }

  @override
  Future<void> requestPasswordReset(String email) async {
    final normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.isEmpty) {
      throw const AccountRecoveryException(
        AccountRecoveryFailureKind.invalidEmail,
      );
    }
    try {
      await _auth.sendPasswordResetEmail(email: normalizedEmail);
    } on FirebaseAuthException catch (error) {
      if (error.code == 'user-not-found') return;
      throw AccountRecoveryException(_recoveryFailureKind(error));
    }
  }

  @override
  Future<FirebaseActionResult> handleActionCode(FirebaseActionLink link) async {
    try {
      if (link.mode == FirebaseActionMode.resetPassword) {
        final email = await _auth.verifyPasswordResetCode(link.oobCode);
        return FirebaseActionResult(
          FirebaseActionResultKind.passwordResetRequired,
          maskedEmail: maskEmail(email),
        );
      }

      await _auth.checkActionCode(link.oobCode);
      await _auth.applyActionCode(link.oobCode);

      if (link.mode == FirebaseActionMode.verifyEmail) {
        final user = _auth.currentUser;
        if (user != null) {
          await user.reload();
          await _auth.currentUser?.getIdToken(true);
          await _syncUserAuthState();
        }
        return const FirebaseActionResult(
          FirebaseActionResultKind.emailVerified,
        );
      }

      return const FirebaseActionResult(
        FirebaseActionResultKind.emailRecovered,
      );
    } catch (error) {
      throw AccountRecoveryException(_recoveryFailureKind(error));
    }
  }

  Future<void> _ensureCustomerProfile({
    String? firstName,
    String? lastName,
    String? phoneNumber,
    bool? acceptedTerms,
    bool? acceptedPrivacy,
  }) async {
    final callable = _functions.httpsCallable('ensureUserProfile');
    await callable.call(<String, dynamic>{
      if (firstName != null) 'firstName': firstName.trim(),
      if (lastName != null) 'lastName': lastName.trim(),
      if (phoneNumber != null) 'phoneNumber': phoneNumber.trim(),
      'acceptedTerms': ?acceptedTerms,
      'acceptedPrivacy': ?acceptedPrivacy,
    });
  }

  CustomerRegistrationFailureKind _registrationFailureKind(Object error) {
    if (error is FirebaseAuthException) {
      return switch (error.code) {
        'email-already-in-use' =>
          CustomerRegistrationFailureKind.emailAlreadyInUse,
        'weak-password' => CustomerRegistrationFailureKind.weakPassword,
        'invalid-email' => CustomerRegistrationFailureKind.invalidEmail,
        'network-request-failed' => CustomerRegistrationFailureKind.network,
        'too-many-requests' => CustomerRegistrationFailureKind.tooManyRequests,
        'operation-not-allowed' ||
        'app-not-authorized' => CustomerRegistrationFailureKind.configuration,
        _ => CustomerRegistrationFailureKind.unknown,
      };
    }
    if (error is FirebaseFunctionsException) {
      return switch (error.code) {
        'permission-denied' => CustomerRegistrationFailureKind.blockedAccount,
        'resource-exhausted' => CustomerRegistrationFailureKind.tooManyRequests,
        'unavailable' ||
        'deadline-exceeded' => CustomerRegistrationFailureKind.network,
        'failed-precondition' ||
        'internal' ||
        'unknown' => CustomerRegistrationFailureKind.profileCreation,
        _ => CustomerRegistrationFailureKind.profileCreation,
      };
    }
    return error is StateError
        ? CustomerRegistrationFailureKind.configuration
        : CustomerRegistrationFailureKind.profileCreation;
  }

  Future<Map<String, dynamic>> _loadActiveCustomerProfile(String uid) async {
    final data = await _loadActiveProfile(uid);
    if (data['role'] != UserRoles.customer) {
      throw const CustomerLoginException(
        CustomerLoginFailureKind.unsupportedRole,
      );
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
      throw const CustomerLoginException(
        CustomerLoginFailureKind.missingProfile,
      );
    }
    final accountStatus = data['accountStatus'] as String? ?? 'disabled';
    if (data['isBlocked'] == true || accountStatus == 'blocked') {
      throw const CustomerLoginException(CustomerLoginFailureKind.blocked);
    }
    if (data['isActive'] != true || accountStatus != 'active') {
      throw const CustomerLoginException(CustomerLoginFailureKind.disabled);
    }
    return data;
  }

  Future<void> _syncUserAuthState() async {
    final callable = _functions.httpsCallable('syncUserAuthState');
    await callable.call<void>();
  }

  CustomerLoginFailureKind _loginFailureKind(Object error) {
    if (error is FirebaseAuthException) {
      return switch (error.code) {
        'wrong-password' ||
        'invalid-credential' ||
        'user-not-found' => CustomerLoginFailureKind.invalidCredentials,
        'invalid-email' => CustomerLoginFailureKind.invalidEmail,
        'too-many-requests' => CustomerLoginFailureKind.tooManyRequests,
        'network-request-failed' => CustomerLoginFailureKind.network,
        'user-disabled' => CustomerLoginFailureKind.disabled,
        'id-token-revoked' ||
        'user-token-expired' ||
        'invalid-user-token' => CustomerLoginFailureKind.sessionExpired,
        'operation-not-allowed' ||
        'app-not-authorized' => CustomerLoginFailureKind.configuration,
        _ => CustomerLoginFailureKind.unknown,
      };
    }
    if (error is FirebaseFunctionsException) {
      final details = error.details;
      final reason = details is Map ? details['reason'] : null;
      if (reason == 'unsupported-role') {
        return CustomerLoginFailureKind.unsupportedRole;
      }
      if (reason == 'disabled') return CustomerLoginFailureKind.disabled;
      if (reason == 'blocked') return CustomerLoginFailureKind.blocked;
      return switch (error.code) {
        'permission-denied' => CustomerLoginFailureKind.blocked,
        'not-found' => CustomerLoginFailureKind.missingProfile,
        'resource-exhausted' => CustomerLoginFailureKind.tooManyRequests,
        'unavailable' ||
        'deadline-exceeded' => CustomerLoginFailureKind.network,
        'failed-precondition' => CustomerLoginFailureKind.configuration,
        _ => CustomerLoginFailureKind.unknown,
      };
    }
    return CustomerLoginFailureKind.unknown;
  }

  AccountRecoveryFailureKind _recoveryFailureKind(Object error) {
    if (error is FirebaseAuthException) {
      return switch (error.code) {
        'too-many-requests' => AccountRecoveryFailureKind.tooManyRequests,
        'user-disabled' => AccountRecoveryFailureKind.disabled,
        'user-token-expired' ||
        'invalid-user-token' ||
        'id-token-revoked' => AccountRecoveryFailureKind.sessionExpired,
        'network-request-failed' => AccountRecoveryFailureKind.network,
        'invalid-email' => AccountRecoveryFailureKind.invalidEmail,
        'invalid-action-code' => AccountRecoveryFailureKind.invalidActionCode,
        'expired-action-code' => AccountRecoveryFailureKind.expiredActionCode,
        'operation-not-allowed' ||
        'app-not-authorized' => AccountRecoveryFailureKind.configuration,
        _ => AccountRecoveryFailureKind.unknown,
      };
    }
    if (error is FirebaseFunctionsException) {
      final details = error.details;
      final reason = details is Map ? details['reason'] : null;
      if (reason == 'disabled') return AccountRecoveryFailureKind.disabled;
      return switch (error.code) {
        'permission-denied' => AccountRecoveryFailureKind.sessionExpired,
        'resource-exhausted' => AccountRecoveryFailureKind.tooManyRequests,
        'unavailable' ||
        'deadline-exceeded' => AccountRecoveryFailureKind.network,
        _ => AccountRecoveryFailureKind.unknown,
      };
    }
    return AccountRecoveryFailureKind.unknown;
  }
}
