import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../domain/phone_verification.dart';

class FirebasePhoneVerificationService implements PhoneVerificationGateway {
  FirebasePhoneVerificationService({
    FirebaseAuth? auth,
    FirebaseFunctions? functions,
  }) : _auth = auth ?? FirebaseAuth.instance,
       _functions =
           functions ??
           FirebaseFunctions.instanceFor(region: 'asia-southeast1');

  final FirebaseAuth _auth;
  final FirebaseFunctions _functions;

  @override
  Future<void> requestCode({
    required String phoneNumber,
    int? resendToken,
    required FeastaPhoneCodeSent onCodeSent,
    required FeastaPhoneVerificationCompleted onVerified,
    required FeastaPhoneVerificationFailed onFailure,
    required void Function(String verificationId) onTimeout,
  }) async {
    _requireCurrentUser();

    try {
      await _auth.verifyPhoneNumber(
        phoneNumber: phoneNumber,
        timeout: const Duration(seconds: 60),
        forceResendingToken: resendToken,
        verificationCompleted: (credential) async {
          try {
            await _linkAndSynchronize(credential);
            await onVerified();
          } catch (error) {
            onFailure(_mapError(error));
          }
        },
        verificationFailed: (error) => onFailure(_mapError(error)),
        codeSent: onCodeSent,
        codeAutoRetrievalTimeout: onTimeout,
      );
    } catch (error) {
      throw _mapError(error);
    }
  }

  @override
  Future<void> confirmCode({
    required String verificationId,
    required String smsCode,
  }) async {
    _requireCurrentUser();

    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );

    try {
      await _linkAndSynchronize(credential);
    } catch (error) {
      throw _mapError(error);
    }
  }

  Future<void> _linkAndSynchronize(
  PhoneAuthCredential credential,
) async {
  final user = _auth.currentUser;

  if (user == null) {
    throw const PhoneVerificationException(
      PhoneVerificationFailureKind.sessionExpired,
    );
  }

  final uid = user.uid;

  final hasPhoneProvider = user.providerData.any(
    (provider) =>
        provider.providerId == PhoneAuthProvider.PROVIDER_ID,
  );

  if (hasPhoneProvider) {
    await user.updatePhoneNumber(credential);
  } else {
    await user.linkWithCredential(credential);
  }

  await user.reload();

  final refreshedUser = _auth.currentUser;

  if (refreshedUser == null || refreshedUser.uid != uid) {
    throw const PhoneVerificationException(
      PhoneVerificationFailureKind.sessionExpired,
    );
  }

  // Refresh the Firebase Auth token after the phone provider was linked.
  await refreshedUser.getIdToken(true);

  final latestUser = _auth.currentUser;

  if (latestUser == null || latestUser.uid != uid) {
    throw const PhoneVerificationException(
      PhoneVerificationFailureKind.sessionExpired,
    );
  }

  try {
    await _functions
        .httpsCallable('syncPhoneVerification')
        .call<void>();
  } on FirebaseFunctionsException catch (error) {
    // Firebase Auth is still valid here. Do NOT tell the user their session
    // expired merely because the synchronization callable failed.
    if (_auth.currentUser != null &&
        _auth.currentUser!.uid == uid &&
        error.code == 'unauthenticated') {
      throw const PhoneVerificationException(
        PhoneVerificationFailureKind.configuration,
      );
    }

    rethrow;
  }
}
  User _requireCurrentUser() {
    final user = _auth.currentUser;
    if (user == null) {
      throw const PhoneVerificationException(
        PhoneVerificationFailureKind.sessionExpired,
      );
    }
    return user;
  }

  PhoneVerificationException _mapError(Object error) {
    if (error is PhoneVerificationException) return error;

    if (error is FirebaseAuthException) {
      return PhoneVerificationException(switch (error.code) {
        'invalid-phone-number' => PhoneVerificationFailureKind.invalidPhone,
        'invalid-verification-code' => PhoneVerificationFailureKind.invalidCode,
        'session-expired' => PhoneVerificationFailureKind.expiredCode,
        'too-many-requests' ||
        'quota-exceeded' => PhoneVerificationFailureKind.tooManyRequests,
        'credential-already-in-use' ||
        'phone-number-already-exists' ||
        'account-exists-with-different-credential' =>
          PhoneVerificationFailureKind.phoneAlreadyInUse,
<<<<<<< HEAD
        'no-current-user' ||
=======
        'provider-already-linked' ||
        'user-mismatch' ||
        'requires-recent-login' => PhoneVerificationFailureKind.sessionExpired,
        'user-disabled' => PhoneVerificationFailureKind.blocked,
>>>>>>> 9ea90a7510b12cc5f9c14e9116104adf39c02701
        'user-token-expired' ||
        'invalid-user-token' ||
        'id-token-revoked' => PhoneVerificationFailureKind.sessionExpired,
        'user-disabled' => PhoneVerificationFailureKind.blocked,
        'network-request-failed' => PhoneVerificationFailureKind.network,
        'operation-not-allowed' ||
        'app-not-authorized' => PhoneVerificationFailureKind.configuration,
        _ => PhoneVerificationFailureKind.unknown,
      });
    }

    if (error is FirebaseFunctionsException) {
      return PhoneVerificationException(switch (error.code) {
        'permission-denied' => PhoneVerificationFailureKind.blocked,
        'unauthenticated' =>PhoneVerificationFailureKind.configuration,
        'resource-exhausted' => PhoneVerificationFailureKind.tooManyRequests,
        'unavailable' ||
        'deadline-exceeded' => PhoneVerificationFailureKind.network,
        'failed-precondition' => PhoneVerificationFailureKind.configuration,
        _ => PhoneVerificationFailureKind.unknown,
      });
    }

    return const PhoneVerificationException(
      PhoneVerificationFailureKind.unknown,
    );
  }
}
