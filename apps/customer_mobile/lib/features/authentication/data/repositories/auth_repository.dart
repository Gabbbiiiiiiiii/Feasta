import '../../../../core/security/auth_timing.dart';
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../../core/security/auth_operation_coordinator.dart';
import '../../../../core/constants/firestore_collections.dart';
import '../../../../core/constants/status_constants.dart';
import '../../domain/account_recovery.dart';
import '../../domain/customer_login.dart';
import '../../domain/google_consent.dart';
import '../../../presentation/screens/legal_document_screen.dart';
import '../../domain/customer_registration.dart';
import '../services/registration_rollback.dart';
import '../../../../core/security/secure_debug_log.dart';

class AuthRepository
    implements
        CustomerRegistrationGateway,
        CustomerLoginGateway,
        PhasedGoogleLoginGateway,
        GoogleConsentGateway,
        EmailVerificationGateway,
        PasswordResetGateway,
        FirebaseActionCodeGateway {
  AuthRepository({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
  }) : _auth = auth ?? FirebaseAuth.instance,
       _db = firestore ?? FirebaseFirestore.instance,
       _functions =
           functions ??
           FirebaseFunctions.instanceFor(region: 'asia-southeast1');

  final FirebaseAuth _auth;
  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;

  User? get currentUser => _auth.currentUser;

  Stream<User?> authStateChanges() => _auth.authStateChanges();

  @override
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput rawInput,
  ) {
    final initialUid = _auth.currentUser?.uid;
    return AuthOperationCoordinator.shared.transition(() {
      if (_auth.currentUser?.uid != initialUid) {
        throw const CustomerRegistrationException(
          CustomerRegistrationFailureKind.blockedAccount,
        );
      }
      return _registerCustomerCoordinated(rawInput);
    });
  }

  Future<CustomerRegistrationResult> _registerCustomerCoordinated(
    CustomerRegistrationInput rawInput,
  ) async {
    final input = rawInput.normalized();
    final normalizedEmail = input.email;
    if (!input.acceptedTerms ||
        !input.acceptedPrivacy ||
        input.termsPolicyVersion.trim().isEmpty ||
        input.privacyPolicyVersion.trim().isEmpty) {
      throw const CustomerRegistrationException(
        CustomerRegistrationFailureKind.invalidPolicyVersion,
      );
    }

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
              createProfile: (created) async {
                if (_auth.currentUser?.uid != created.uid) {
                  throw const CustomerRegistrationException(
                    CustomerRegistrationFailureKind.blockedAccount,
                  );
                }
                await _ensureCustomerProfile(
                  firstName: input.firstName,
                  lastName: input.lastName,
                  acceptedTerms: input.acceptedTerms,
                  acceptedPrivacy: input.acceptedPrivacy,
                  termsPolicyVersion: input.termsPolicyVersion,
                  privacyPolicyVersion: input.privacyPolicyVersion,
                );
              },
              rollbackIdentity: (created) => created.delete(),
              onProfileError: (error, stackTrace) {
                secureDebugLog(
                  'Customer profile creation failed',
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
          acceptedTerms: input.acceptedTerms,
          acceptedPrivacy: input.acceptedPrivacy,
          termsPolicyVersion: input.termsPolicyVersion,
          privacyPolicyVersion: input.privacyPolicyVersion,
        );
      }

      if (_auth.currentUser?.uid != user.uid) {
        throw const CustomerRegistrationException(
          CustomerRegistrationFailureKind.blockedAccount,
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
          stackTrace: stackTrace,
        );
      }
      if (_auth.currentUser?.uid != user.uid) {
        throw const CustomerRegistrationException(
          CustomerRegistrationFailureKind.blockedAccount,
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
      secureDebugLog('Customer registration failed', stackTrace: stackTrace);
      throw CustomerRegistrationException(_registrationFailureKind(error));
    }
  }

  @override
  Future<bool> refreshVerification() => AuthOperationCoordinator.shared.run(
    () => _refreshVerificationCoordinated(),
  );

  Future<bool> _refreshVerificationCoordinated() async {
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
  }) => AuthOperationCoordinator.shared.transition(
    () => _registerProviderCoordinated(
      firstName: firstName,
      lastName: lastName,
      email: email,
      phoneNumber: phoneNumber,
      password: password,
      businessName: businessName,
      businessPhone: businessPhone,
      businessEmail: businessEmail,
      businessAddress: businessAddress,
      city: city,
      province: province,
      description: description,
      serviceAreas: serviceAreas,
      eventTypesSupported: eventTypesSupported,
      providerServiceType: providerServiceType,
      providerCategory: providerCategory,
    ),
  );

  Future<void> _registerProviderCoordinated({
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
        'serviceCategories': <String>[providerCategory],
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
  Future<void> resendVerification() => AuthOperationCoordinator.shared.run(
    () => _resendVerificationCoordinated(),
  );

  Future<void> _resendVerificationCoordinated() async {
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
  }) => AuthOperationCoordinator.shared.transition(
    () => _signInWithEmailCoordinated(email: email, password: password),
  );

  Future<CustomerLoginResult> _signInWithEmailCoordinated({
    required String email,
    required String password,
  }) async {
    try {
      final credential = await _auth.signInWithEmailAndPassword(
        email: email.trim().toLowerCase(),
        password: password,
      );

      final user = credential.user;

      if (user == null) {
        throw StateError('Unable to load the signed-in account.');
      }

      try {
        await _syncUserAuthState();
      } on FirebaseFunctionsException catch (error) {
        if (error.code != 'not-found') {
          rethrow;
        }

        await _ensureCustomerProfile();
        await _syncUserAuthState();
      }

      await _loadActiveCustomerProfile(user.uid);
      await user.getIdToken(true);

      return CustomerLoginResult(
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
      );
    } on CustomerLoginException catch (error) {
      await _signOutIfLoginMustBeRejected(error.kind);
      rethrow;
    } catch (error) {
      final kind = _loginFailureKind(error);

      await _signOutIfLoginMustBeRejected(kind);

      throw CustomerLoginException(kind);
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
        stackTrace: stackTrace,
      );
      return null;
    }
  }

  @override
  Future<void> logout() {
    final uid = _auth.currentUser?.uid;
    return AuthOperationCoordinator.shared.transition(() async {
      if (_auth.currentUser?.uid != uid) return;
      await _logoutCoordinated();
    });
  }

  Future<void> _logoutCoordinated() async {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Firebase sign-out must still run if the Google SDK has no session.
    }
    await _auth.signOut();
  }

  GoogleConsent? _googleConsent;
  @override
  void stageGoogleConsent(GoogleConsent? consent) {
    _googleConsent = consent;
  }

  @override
  Future<CustomerLoginResult> signInWithGoogle() =>
      signInWithGooglePhased(onAccountSelected: () {});

  @override
  Future<CustomerLoginResult> signInWithGooglePhased({
    required void Function() onAccountSelected,
  }) => AuthOperationCoordinator.shared.transition(
    () => _signInWithGoogleCoordinated(onAccountSelected),
  );

  Future<CustomerLoginResult> _signInWithGoogleCoordinated(
    void Function() onAccountSelected,
  ) async {
    final accepted = _googleConsent;
    _googleConsent = null;
    PendingGoogleConsent.clear();
    try {
      await AuthTiming.measure(
        'google_sdk_initialize',
        () => GoogleSignIn.instance.initialize(),
      );

      final googleUser = await AuthTiming.measure(
        'google_account_selection',
        () => GoogleSignIn.instance.authenticate(),
      );
      onAccountSelected();
      final googleAuth = googleUser.authentication;

      final credential = GoogleAuthProvider.credential(
        idToken: googleAuth.idToken,
      );

      final userCredential = await AuthTiming.measure(
        'firebase_credential',
        () => _auth.signInWithCredential(credential),
      );

      final user = userCredential.user;

      if (user == null) {
        throw StateError('Google sign-in failed.');
      }

      if (accepted != null &&
          await AuthTiming.measure(
            'google_consent_version_verification',
            () => accepted.isCurrent(loadCurrentLegalDocument),
          ) &&
          _auth.currentUser?.uid == user.uid) {
        PendingGoogleConsent.epoch = AuthOperationCoordinator.shared.epoch;
        PendingGoogleConsent.uid = user.uid;
        PendingGoogleConsent.consent = accepted;
      }
      return CustomerLoginResult(
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
      );
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) {
        throw const CustomerLoginException(CustomerLoginFailureKind.cancelled);
      }

      secureDebugLog(
        'Google account selection failed',
        stackTrace: StackTrace.current,
      );

      throw const CustomerLoginException(CustomerLoginFailureKind.unknown);
    } on FirebaseAuthException catch (error, stackTrace) {
      secureDebugLog(
        'Firebase Google sign-in failed with code ${error.code}',
        stackTrace: stackTrace,
      );

      final kind = _loginFailureKind(error);

      await _signOutIfLoginMustBeRejected(kind);

      throw CustomerLoginException(kind);
    } on CustomerLoginException {
      rethrow;
    } catch (error, stackTrace) {
      secureDebugLog(
        'Google sign-in failed before a usable Firebase session was returned',
        stackTrace: stackTrace,
      );

      final kind = _loginFailureKind(error);

      await _signOutIfLoginMustBeRejected(kind);

      throw CustomerLoginException(kind);
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
      // Never log the exception message, email, tokens, or request payload.
      final code = RegExp(r'^[a-z][a-z0-9-]{0,79}$').hasMatch(error.code)
          ? error.code
          : 'unrecognized-code';
      // The general logger redacts 'token' within canonical error codes.
      // Emit only this validated SDK code, never exception contents or payloads.
      if (kDebugMode) debugPrint('Recovery request FirebaseAuth code=$code');
      // Match the ordinary response for an unknown account without revealing it.
      if (error.code == 'user-not-found') return;
      final kind = switch (error.code) {
        'invalid-api-key' ||
        'api-key-not-valid' ||
        'invalid-app-id' ||
        'missing-app-id' ||
        'configuration-not-found' ||
        'invalid-continue-uri' ||
        'unauthorized-continue-uri' ||
        'missing-continue-uri' ||
        'invalid-app-credential' ||
        'missing-app-credential' ||
        'app-not-verified' ||
        'app-check-token-invalid' ||
        'captcha-check-failed' ||
        'invalid-recaptcha-token' ||
        'missing-recaptcha-token' ||
        'recaptcha-not-enabled' => AccountRecoveryFailureKind.configuration,
        'quota-exceeded' => AccountRecoveryFailureKind.tooManyRequests,
        _ => _recoveryFailureKind(error),
      };
      throw AccountRecoveryException(kind);
    }
  }

  @override
  Future<FirebaseActionResult> handleActionCode(FirebaseActionLink link) =>
      AuthOperationCoordinator.shared.transition(
        () => _handleActionCodeCoordinated(link),
      );

  Future<FirebaseActionResult> _handleActionCodeCoordinated(
    FirebaseActionLink link,
  ) async {
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
    bool? acceptedTerms,
    bool? acceptedPrivacy,
    String? termsPolicyVersion,
    String? privacyPolicyVersion,
  }) async {
    final callable = _functions.httpsCallable('ensureUserProfile');
    await callable.call(<String, dynamic>{
      if (firstName != null) 'firstName': firstName.trim(),
      if (lastName != null) 'lastName': lastName.trim(),
      'acceptedTerms': ?acceptedTerms,
      'acceptedPrivacy': ?acceptedPrivacy,
      'termsPolicyVersion': ?termsPolicyVersion,
      'privacyPolicyVersion': ?privacyPolicyVersion,
    });
  }

  Future<void> _signOutIfLoginMustBeRejected(
    CustomerLoginFailureKind kind,
  ) async {
    if (!_shouldRejectAuthenticatedSession(kind)) {
      return;
    }

    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Firebase sign-out remains authoritative when Google has no session.
    }

    await _auth.signOut();
  }

  bool _shouldRejectAuthenticatedSession(CustomerLoginFailureKind kind) {
    return switch (kind) {
      CustomerLoginFailureKind.blocked ||
      CustomerLoginFailureKind.disabled ||
      CustomerLoginFailureKind.unsupportedRole ||
      CustomerLoginFailureKind.missingProfile ||
      CustomerLoginFailureKind.sessionExpired => true,

      CustomerLoginFailureKind.invalidCredentials ||
      CustomerLoginFailureKind.invalidEmail ||
      CustomerLoginFailureKind.tooManyRequests ||
      CustomerLoginFailureKind.network ||
      CustomerLoginFailureKind.cancelled ||
      CustomerLoginFailureKind.configuration ||
      CustomerLoginFailureKind.unknown => false,
    };
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
      final policyFailure = registrationPolicyFailure(
        error.code,
        error.details,
      );
      if (policyFailure != null) return policyFailure;
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
        'permission-denied' => CustomerLoginFailureKind.unknown,
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
        'permission-denied' => AccountRecoveryFailureKind.unknown,
        'resource-exhausted' => AccountRecoveryFailureKind.tooManyRequests,
        'unavailable' ||
        'deadline-exceeded' => AccountRecoveryFailureKind.network,
        _ => AccountRecoveryFailureKind.unknown,
      };
    }
    return AccountRecoveryFailureKind.unknown;
  }
}
