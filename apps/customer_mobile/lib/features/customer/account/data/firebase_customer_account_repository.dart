import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../../core/security/secure_debug_log.dart';
import '../domain/customer_account_management.dart';

class FirebaseCustomerAccountRepository implements CustomerAccountGateway {
  FirebaseCustomerAccountRepository({
    FirebaseAuth? auth,
    FirebaseFunctions? functions,
  }) : _auth = auth ?? FirebaseAuth.instance,
       _functions =
           functions ??
           FirebaseFunctions.instanceFor(region: 'asia-southeast1');

  final FirebaseAuth _auth;
  final FirebaseFunctions _functions;

  User get _user {
    final user = _auth.currentUser;
    if (user == null) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.sessionExpired,
      );
    }
    return user;
  }

  @override
  bool get supportsPasswordChanges =>
      _auth.currentUser?.providerData.any(
        (provider) => provider.providerId == 'password',
      ) ??
      false;

  @override
  Future<void> updateProfile(CustomerProfileUpdate update) =>
      _call('updateCustomerProfile', <String, dynamic>{
        'firstName': update.firstName.trim(),
        'lastName': update.lastName.trim(),
        'address': update.address.trim(),
        'city': update.city.trim(),
        'province': update.province.trim(),
      });

  @override
  Future<void> updatePreferences(CustomerPrivacyPreferences preferences) =>
      _call('updateCustomerPreferences', <String, dynamic>{
        'marketingConsent': preferences.marketingConsent,
        'pushNotificationsEnabled': preferences.pushNotificationsEnabled,
        'emailNotificationsEnabled': preferences.emailNotificationsEnabled,
      });

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    if (!supportsPasswordChanges) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.passwordProviderRequired,
      );
    }
    try {
      await _reauthenticate(currentPassword);
      await _user.updatePassword(newPassword);
    } catch (error, stackTrace) {
      _throwMapped(error, stackTrace);
    }
  }

  @override
  Future<void> requestEmailUpdate({
    required String currentPassword,
    required String newEmail,
  }) async {
    if (!supportsPasswordChanges) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.passwordProviderRequired,
      );
    }
    try {
      await _reauthenticate(currentPassword);
      await _user.verifyBeforeUpdateEmail(newEmail.trim().toLowerCase());
    } catch (error, stackTrace) {
      _throwMapped(error, stackTrace);
    }
  }

  @override
  Future<void> deactivate({String? currentPassword, String? reason}) async {
    await _reauthenticateForSensitiveAction(currentPassword);
    await _call('deactivateCustomerAccount', <String, dynamic>{
      if (reason != null) 'reason': reason.trim(),
    });
    await _signOut();
  }

  @override
  Future<void> revokeAllSessions({String? currentPassword}) async {
    await _reauthenticateForSensitiveAction(currentPassword);
    await _call('revokeAllCustomerSessions', const <String, dynamic>{});
    await _signOut();
  }

  Future<void> _reauthenticateForSensitiveAction(String? password) async {
    try {
      if (supportsPasswordChanges) {
        await _reauthenticate(password ?? '');
      } else {
        await GoogleSignIn.instance.initialize();
        final googleUser = await GoogleSignIn.instance.authenticate();
        final googleAuth = googleUser.authentication;
        await _user.reauthenticateWithCredential(
          GoogleAuthProvider.credential(idToken: googleAuth.idToken),
        );
      }
      await _user.getIdToken(true);
    } catch (error, stackTrace) {
      _throwMapped(error, stackTrace);
    }
  }

  Future<void> _reauthenticate(String password) async {
    final email = _user.email;
    if (email == null || password.isEmpty) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.recentLoginRequired,
      );
    }
    await _user.reauthenticateWithCredential(
      EmailAuthProvider.credential(email: email, password: password),
    );
    await _user.getIdToken(true);
  }

  Future<void> _call(String name, Map<String, dynamic> data) async {
    try {
      await _functions.httpsCallable(name).call<void>(data);
    } catch (error, stackTrace) {
      _throwMapped(error, stackTrace);
    }
  }

  Future<void> _signOut() async {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Firebase sign-out remains authoritative when Google has no session.
    }
    await _auth.signOut();
  }

  Never _throwMapped(Object error, StackTrace stackTrace) {
    if (error is CustomerAccountException) throw error;
    secureDebugLog(
      'Customer account operation failed',
      error: error,
      stackTrace: stackTrace,
    );
    if (error is FirebaseAuthException) {
      throw CustomerAccountException(switch (error.code) {
        'wrong-password' ||
        'invalid-credential' => CustomerAccountFailureKind.invalidCredential,
        'requires-recent-login' =>
          CustomerAccountFailureKind.recentLoginRequired,
        'weak-password' => CustomerAccountFailureKind.weakPassword,
        'email-already-in-use' => CustomerAccountFailureKind.emailAlreadyInUse,
        'invalid-email' => CustomerAccountFailureKind.invalidEmail,
        'user-disabled' => CustomerAccountFailureKind.blocked,
        'too-many-requests' => CustomerAccountFailureKind.rateLimited,
        'network-request-failed' => CustomerAccountFailureKind.network,
        'user-token-expired' ||
        'invalid-user-token' ||
        'id-token-revoked' => CustomerAccountFailureKind.sessionExpired,
        'operation-not-allowed' ||
        'app-not-authorized' => CustomerAccountFailureKind.configuration,
        _ => CustomerAccountFailureKind.unknown,
      });
    }
    if (error is FirebaseFunctionsException) {
      throw CustomerAccountException(switch (error.code) {
        'unauthenticated' => CustomerAccountFailureKind.recentLoginRequired,
        'permission-denied' => CustomerAccountFailureKind.blocked,
        'resource-exhausted' => CustomerAccountFailureKind.rateLimited,
        'unavailable' ||
        'deadline-exceeded' => CustomerAccountFailureKind.network,
        'failed-precondition' => CustomerAccountFailureKind.configuration,
        _ => CustomerAccountFailureKind.unknown,
      });
    }
    throw const CustomerAccountException(CustomerAccountFailureKind.unknown);
  }
}
