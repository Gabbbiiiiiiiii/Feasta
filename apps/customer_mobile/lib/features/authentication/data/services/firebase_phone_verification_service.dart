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
    if (_auth.currentUser == null) {
      throw const PhoneVerificationException(
        PhoneVerificationFailureKind.sessionExpired,
      );
    }
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

  Future<void> _linkAndSynchronize(PhoneAuthCredential credential) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw const PhoneVerificationException(
        PhoneVerificationFailureKind.sessionExpired,
      );
    }
    final hasPhoneProvider = user.providerData.any(
      (provider) => provider.providerId == PhoneAuthProvider.PROVIDER_ID,
    );
    if (hasPhoneProvider) {
      await user.updatePhoneNumber(credential);
    } else {
      await user.linkWithCredential(credential);
    }
    await user.reload();
    await _auth.currentUser?.getIdToken(true);
    await _functions.httpsCallable('syncPhoneVerification').call<void>();
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
        'credential-already-in-use' || 'phone-number-already-exists' =>
          PhoneVerificationFailureKind.phoneAlreadyInUse,
        'user-disabled' => PhoneVerificationFailureKind.blocked,
        'user-token-expired' ||
        'invalid-user-token' ||
        'id-token-revoked' => PhoneVerificationFailureKind.sessionExpired,
        'network-request-failed' => PhoneVerificationFailureKind.network,
        'operation-not-allowed' ||
        'app-not-authorized' => PhoneVerificationFailureKind.configuration,
        _ => PhoneVerificationFailureKind.unknown,
      });
    }
    if (error is FirebaseFunctionsException) {
      return PhoneVerificationException(switch (error.code) {
        'permission-denied' => PhoneVerificationFailureKind.blocked,
        'unauthenticated' => PhoneVerificationFailureKind.sessionExpired,
        'resource-exhausted' => PhoneVerificationFailureKind.tooManyRequests,
        'unavailable' ||
        'deadline-exceeded' => PhoneVerificationFailureKind.network,
        _ => PhoneVerificationFailureKind.unknown,
      });
    }
    return const PhoneVerificationException(
      PhoneVerificationFailureKind.unknown,
    );
  }
}
