import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../domain/phone_verification.dart';

class FirebasePhoneVerificationService implements PhoneVerificationGateway {
  FirebasePhoneVerificationService({
    FirebaseAuth? auth,
    FirebaseFunctions? functions,
    Future<String?> Function(String uid)? loadRegisteredPhone,
  }) : _auth = auth ?? FirebaseAuth.instance,
       _functions =
           functions ??
           FirebaseFunctions.instanceFor(region: 'asia-southeast1'),
       _loadRegisteredPhone = loadRegisteredPhone ?? _readRegisteredPhone;

  final FirebaseAuth _auth;
  final FirebaseFunctions _functions;
  final Future<String?> Function(String uid) _loadRegisteredPhone;
  _PhoneVerificationAttempt? _activeAttempt;

  static Future<String?> _readRegisteredPhone(String uid) async {
    final snapshot = await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .get();
    final value = snapshot.data()?['phoneNumber'];
    return value is String ? value : null;
  }

  @override
  Future<void> requestCode({
    required String phoneNumber,
    int? resendToken,
    required FeastaPhoneCodeSent onCodeSent,
    required FeastaPhoneVerificationCompleted onVerified,
    required FeastaPhoneVerificationFailed onFailure,
    required void Function(String verificationId) onTimeout,
  }) async {
    final attempt = _PhoneVerificationAttempt(_requireCurrentUser().uid);
    _activeAttempt = attempt;

    try {
      final requestedPhone = normalizePhilippineMobile(phoneNumber);
      if (requestedPhone == null) {
        throw const PhoneVerificationException(
          PhoneVerificationFailureKind.invalidPhone,
        );
      }
      final registeredPhone = await _loadRegisteredPhone(attempt.uid);
      _requireAttempt(attempt);
      // An explicit number means replacement to the server. Omit it when
      // verifying the registered number, including on resend.
      final HttpsCallableResult<dynamic> response;
      try {
        response = await _functions
            .httpsCallable('prepareCustomerPhoneVerification')
            .call<dynamic>(
              registeredPhone != null &&
                      normalizePhilippineMobile(registeredPhone) ==
                          requestedPhone
                  ? <String, dynamic>{}
                  : <String, dynamic>{'phoneNumber': requestedPhone},
            );
      } on FirebaseFunctionsException catch (error) {
        if (error.code == 'failed-precondition' &&
            error.message ==
                'Verify your email before verifying your mobile number.') {
          throw const PhoneVerificationException(
            PhoneVerificationFailureKind.emailVerificationRequired,
          );
        }
        rethrow;
      }
      _requireAttempt(attempt);
      final data = response.data;
      final value = data is Map ? data['phoneNumber'] : null;
      final preparedPhone = value is String
          ? normalizePhilippineMobile(value)
          : null;
      if (preparedPhone == null || preparedPhone != requestedPhone) {
        throw const PhoneVerificationException(
          PhoneVerificationFailureKind.configuration,
        );
      }
      await _auth.verifyPhoneNumber(
        phoneNumber: preparedPhone,
        timeout: const Duration(seconds: 60),
        forceResendingToken: resendToken,
        verificationCompleted: (credential) async {
          if (!identical(_activeAttempt, attempt) || attempt.isCompleting) {
            return;
          }
          try {
            await _linkAndSynchronize(credential, attempt);
            await onVerified();
          } catch (error) {
            if (identical(_activeAttempt, attempt)) {
              _invalidateIfSessionChanged(attempt);
              onFailure(_mapError(error));
            }
          }
        },
        verificationFailed: (error) {
          _deliverCallback(attempt, onFailure, () {
            _activeAttempt = null;
            onFailure(_mapError(error));
          });
        },
        codeSent: (verificationId, token) {
          _deliverCallback(attempt, onFailure, () {
            attempt.verificationId = verificationId;
            onCodeSent(verificationId, token);
          });
        },
        codeAutoRetrievalTimeout: (verificationId) {
          _deliverCallback(attempt, onFailure, () {
            attempt.verificationId = verificationId;
            onTimeout(verificationId);
          });
        },
      );
    } catch (error) {
      if (identical(_activeAttempt, attempt)) _activeAttempt = null;
      throw _mapError(error);
    }
  }

  @override
  Future<void> confirmCode({
    required String verificationId,
    required String smsCode,
  }) async {
    final attempt = _activeAttempt;
    if (attempt == null || attempt.verificationId != verificationId) {
      throw const PhoneVerificationException(
        PhoneVerificationFailureKind.expiredCode,
      );
    }

    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );

    try {
      await _linkAndSynchronize(credential, attempt);
    } catch (error) {
      _invalidateIfSessionChanged(attempt);
      throw _mapError(error);
    }
  }

  Future<void> _linkAndSynchronize(
    PhoneAuthCredential credential,
    _PhoneVerificationAttempt attempt,
  ) async {
    final user = _requireAttempt(attempt);
    if (attempt.isCompleting) {
      throw const PhoneVerificationException(
        PhoneVerificationFailureKind.tooManyRequests,
      );
    }
    attempt.isCompleting = true;
    try {
      final hasPhoneProvider = user.providerData.any(
        (provider) => provider.providerId == PhoneAuthProvider.PROVIDER_ID,
      );

      if (hasPhoneProvider) {
        await user.updatePhoneNumber(credential);
      } else {
        await user.linkWithCredential(credential);
      }

      _requireAttempt(attempt);
      await user.reload();

      final refreshedUser = _requireAttempt(attempt);

      // Refresh the Firebase Auth token after the phone provider was linked.
      await refreshedUser.getIdToken(true);

      _requireAttempt(attempt);

      try {
        await _functions.httpsCallable('syncPhoneVerification').call<void>();
      } on FirebaseFunctionsException catch (error) {
        // Firebase Auth is still valid here. Do NOT tell the user their session
        // expired merely because the synchronization callable failed.
        _requireAttempt(attempt);
        if (error.code == 'unauthenticated') {
          throw const PhoneVerificationException(
            PhoneVerificationFailureKind.configuration,
          );
        }

        rethrow;
      }
      _requireAttempt(attempt);
      _activeAttempt = null;
    } finally {
      attempt.isCompleting = false;
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

  User _requireAttempt(_PhoneVerificationAttempt attempt) {
    if (!identical(_activeAttempt, attempt)) {
      throw const PhoneVerificationException(
        PhoneVerificationFailureKind.expiredCode,
      );
    }
    final user = _requireCurrentUser();
    if (user.uid != attempt.uid) {
      throw const PhoneVerificationException(
        PhoneVerificationFailureKind.sessionExpired,
      );
    }
    return user;
  }

  void _invalidateIfSessionChanged(_PhoneVerificationAttempt attempt) {
    if (identical(_activeAttempt, attempt) &&
        _auth.currentUser?.uid != attempt.uid) {
      _activeAttempt = null;
    }
  }

  void _deliverCallback(
    _PhoneVerificationAttempt attempt,
    FeastaPhoneVerificationFailed onFailure,
    void Function() callback,
  ) {
    if (!identical(_activeAttempt, attempt)) return;
    try {
      _requireAttempt(attempt);
      callback();
    } on PhoneVerificationException catch (error) {
      _invalidateIfSessionChanged(attempt);
      onFailure(error);
    }
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
        'no-current-user' ||
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
        'invalid-argument' => PhoneVerificationFailureKind.invalidPhone,
        'already-exists' => PhoneVerificationFailureKind.phoneAlreadyInUse,
        'permission-denied' => PhoneVerificationFailureKind.blocked,
        'unauthenticated' => PhoneVerificationFailureKind.configuration,
        'resource-exhausted' => PhoneVerificationFailureKind.tooManyRequests,
        'unavailable' ||
        'deadline-exceeded' => PhoneVerificationFailureKind.network,
        'failed-precondition' => PhoneVerificationFailureKind.configuration,
        _ => PhoneVerificationFailureKind.unknown,
      });
    }

    if (error is FirebaseException) {
      return PhoneVerificationException(switch (error.code) {
        'permission-denied' => PhoneVerificationFailureKind.blocked,
        'unavailable' ||
        'deadline-exceeded' => PhoneVerificationFailureKind.network,
        _ => PhoneVerificationFailureKind.configuration,
      });
    }

    return const PhoneVerificationException(
      PhoneVerificationFailureKind.unknown,
    );
  }
}

class _PhoneVerificationAttempt {
  _PhoneVerificationAttempt(this.uid);
  final String uid;
  String? verificationId;
  bool isCompleting = false;
}
