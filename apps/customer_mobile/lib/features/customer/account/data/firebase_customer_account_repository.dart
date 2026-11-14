import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../../core/security/secure_debug_log.dart';
import '../../../../core/security/auth_operation_coordinator.dart';
import 'password_recovery_store.dart';
import '../domain/customer_account_management.dart';

class FirebaseCustomerAccountRepository
    implements CustomerAccountGateway, CustomerPasswordRecoveryGateway {
  FirebaseCustomerAccountRepository({
    FirebaseAuth? auth,
    FirebaseFunctions? functions,
    Future<void> Function()? signOutGoogle,
    PasswordRecoveryStore? recoveryStore,
  }) : _auth = auth ?? FirebaseAuth.instance,
       _functions =
           functions ??
           FirebaseFunctions.instanceFor(region: 'asia-southeast1'),
       _signOutGoogle = signOutGoogle ?? GoogleSignIn.instance.signOut,
       _recoveryStore = recoveryStore ?? PreferencesPasswordRecoveryStore();

  final FirebaseAuth _auth;
  final FirebaseFunctions _functions;
  final Future<void> Function() _signOutGoogle;
  bool _changingPassword = false;
  final PasswordRecoveryStore _recoveryStore;
  String? _liveProgressUid;
  String? _liveRevocationUid;
  int? _liveEpoch;

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
  }) => _runPasswordOperation(
    currentPassword: currentPassword,
    newPassword: newPassword,
    resumeOnly: false,
  );

  @override
  Future<void> resumePasswordCleanup({String? currentPassword}) =>
      _runPasswordOperation(
        currentPassword: currentPassword,
        newPassword: null,
        resumeOnly: true,
      );

  @override
  Future<CustomerPasswordChangeException?> loadPasswordRecovery() =>
      AuthOperationCoordinator.shared.run(() async {
        _discardOldLiveSession();
        final uid = _auth.currentUser?.uid;
        if (uid == null) return null;
        final state = await _recoveryStore.read(uid);
        _requirePasswordOwner(uid);
        if (state == null) return null;
        if (state.uid != uid) {
          throw const CustomerAccountException(
            CustomerAccountFailureKind.configuration,
          );
        }
        return _recoveryIssue(
          state,
          requiresReauthentication: _liveProgressUid != uid,
        );
      });

  Future<void> _runPasswordOperation({
    required String? currentPassword,
    required String? newPassword,
    required bool resumeOnly,
  }) async {
    if (_changingPassword) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.rateLimited,
      );
    }
    final uid = _user.uid;
    _changingPassword = true;
    try {
      await AuthOperationCoordinator.shared.protectSession(
        () => AuthOperationCoordinator.shared.run(
          () => _performPasswordOperation(
            uid,
            currentPassword: currentPassword,
            newPassword: newPassword,
            resumeOnly: resumeOnly,
          ),
        ),
      );
    } finally {
      _changingPassword = false;
    }
  }

  Future<void> _performPasswordOperation(
    String uid, {
    required String? currentPassword,
    required String? newPassword,
    required bool resumeOnly,
  }) async {
    _discardOldLiveSession();
    _requirePasswordOwner(uid);
    final user = _user;
    var state = await _recoveryStore.read(uid);
    _requirePasswordOwner(uid);
    if (state != null && state.uid != uid) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.configuration,
      );
    }
    if (state != null && _liveProgressUid != uid) {
      // Never reinterpret the old password from a repeated change request as
      // credentials for cleanup. Only the explicit recovery action may reauth.
      if (!resumeOnly || currentPassword == null || currentPassword.isEmpty) {
        throw _recoveryIssue(state, requiresReauthentication: true);
      }
      await _reauthenticatePasswordOwner(user, uid, currentPassword);
      _liveProgressUid = uid;
      _liveEpoch = AuthOperationCoordinator.shared.epoch;
    } else if (state == null && resumeOnly) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.configuration,
      );
    }

    if (state == null) {
      await _reauthenticatePasswordOwner(user, uid, currentPassword ?? '');
      state = PasswordRecoveryState(
        uid,
        PasswordRecoveryStage.updateDispatched,
      );
      // Persistence must succeed before dispatch; process death is uncertain.
      await _recoveryStore.write(state);
      try {
        _requirePasswordOwner(uid);
      } catch (_) {
        await _recoveryStore.clear(uid); // No update was dispatched yet.
        rethrow;
      }
      _liveProgressUid = uid;
      _liveEpoch = AuthOperationCoordinator.shared.epoch;
      try {
        await user.updatePassword(newPassword!);
        state = PasswordRecoveryState(
          uid,
          PasswordRecoveryStage.updateConfirmed,
        );
        await _recoveryStore.write(state);
      } catch (error, stackTrace) {
        // This validation error is a known rejection. Token/network/reload
        // errors do not establish that the native update was rejected.
        if (error is FirebaseAuthException && error.code == 'weak-password') {
          await _recoveryStore.clear(uid);
          _liveProgressUid = null;
          _throwMapped(error, stackTrace, logDetails: false);
        }
        // Keep the dispatched marker. Try safe cleanup, then report uncertainty.
      }
    }

    var recoveryState = state!;
    var signedOut = _auth.currentUser == null;
    var logoutAttempted = false;
    try {
      _requirePasswordOwner(uid);
      if (_liveRevocationUid != uid) {
        await user.getIdToken(true);
        _requirePasswordOwner(uid);
        final result = await _functions
            .httpsCallable('revokeAllAccountSessions')
            .call<dynamic>(<String, dynamic>{});
        final data = result.data;
        if (data is! Map || data['success'] != true) {
          throw const CustomerAccountException(
            CustomerAccountFailureKind.configuration,
          );
        }
        _liveRevocationUid = uid;
        recoveryState = PasswordRecoveryState(
          uid,
          _isUncertain(recoveryState)
              ? PasswordRecoveryStage.uncertainRevocationConfirmed
              : PasswordRecoveryStage.revocationConfirmed,
        );
        await _recoveryStore.write(recoveryState);
      }
      if (_auth.currentUser != null) {
        _requirePasswordOwner(uid);
        logoutAttempted = true;
        await _signOutPasswordOwner(uid);
      }
      signedOut = _auth.currentUser == null;
    } catch (_) {
      if (_auth.currentUser?.uid == uid && !logoutAttempted) {
        try {
          await _signOutPasswordOwner(uid);
        } catch (_) {}
      }
      signedOut = _auth.currentUser == null;
    }
    final accountChanged =
        _auth.currentUser != null && _auth.currentUser!.uid != uid;
    if (_liveRevocationUid == uid &&
        signedOut &&
        !accountChanged &&
        (!_isUncertain(recoveryState) || resumeOnly)) {
      try {
        await _recoveryStore.clear(uid);
      } catch (_) {
        _liveProgressUid = null;
        _liveRevocationUid = null;
        throw const CustomerPasswordChangeException(
          sessionsRevoked: true,
          signedOut: true,
          requiresReauthentication: true,
        );
      }
      _liveProgressUid = null;
      _liveRevocationUid = null;
      return;
    }
    final issue = _recoveryIssue(
      recoveryState,
      signedOut: signedOut,
      accountChanged: accountChanged,
      requiresReauthentication: signedOut || accountChanged,
    );
    if (signedOut || accountChanged) {
      _liveProgressUid = null;
      _liveRevocationUid = null;
    }
    throw issue;
  }

  bool _isUncertain(PasswordRecoveryState state) =>
      state.stage == PasswordRecoveryStage.updateDispatched ||
      state.stage == PasswordRecoveryStage.uncertainRevocationConfirmed;

  void _discardOldLiveSession() {
    if (_liveEpoch != AuthOperationCoordinator.shared.epoch) {
      _liveProgressUid = null;
      _liveRevocationUid = null;
    }
  }

  CustomerPasswordChangeException _recoveryIssue(
    PasswordRecoveryState state, {
    bool signedOut = false,
    bool accountChanged = false,
    bool requiresReauthentication = false,
  }) => CustomerPasswordChangeException(
    sessionsRevoked: _liveRevocationUid == state.uid,
    signedOut: signedOut,
    accountChanged: accountChanged,
    updateOutcomeUncertain: _isUncertain(state),
    requiresReauthentication: requiresReauthentication,
  );

  Future<void> _reauthenticatePasswordOwner(
    User user,
    String uid,
    String password,
  ) async {
    _requirePasswordOwner(uid);
    if (!user.providerData.any((p) => p.providerId == 'password')) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.passwordProviderRequired,
      );
    }
    if (user.email == null || password.isEmpty) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.recentLoginRequired,
      );
    }
    try {
      await user.reauthenticateWithCredential(
        EmailAuthProvider.credential(email: user.email!, password: password),
      );
      _requirePasswordOwner(uid);
      await user.getIdToken(true);
      _requirePasswordOwner(uid);
    } catch (error, stackTrace) {
      _throwMapped(error, stackTrace, logDetails: false);
    }
  }

  void _requirePasswordOwner(String uid) {
    if (_auth.currentUser?.uid != uid) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.sessionExpired,
      );
    }
  }

  Future<void> _signOutPasswordOwner(String uid) async {
    _requirePasswordOwner(uid);
    try {
      await _signOutGoogle();
    } catch (_) {
      // Firebase sign-out remains authoritative for password accounts.
    }
    _requirePasswordOwner(uid);
    await _auth.signOut();
    // A concurrently signed-in account must not be treated as signed out.
    if (_auth.currentUser != null) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.sessionExpired,
      );
    }
  }

  @override
  Future<void> requestEmailUpdate({
    required String currentPassword,
    required String newEmail,
  }) {
    final uid = _user.uid;
    return AuthOperationCoordinator.shared.transition(() async {
      _requirePasswordOwner(uid);
      await _requestEmailUpdateCoordinated(
        currentPassword: currentPassword,
        newEmail: newEmail,
      );
    });
  }

  Future<void> _requestEmailUpdateCoordinated({
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
  Future<void> deactivate({String? currentPassword, String? reason}) {
    final uid = _user.uid;
    return AuthOperationCoordinator.shared.transition(() async {
      _requirePasswordOwner(uid);
      await _deactivateCoordinated(
        currentPassword: currentPassword,
        reason: reason,
      );
    });
  }

  Future<void> _deactivateCoordinated({
    String? currentPassword,
    String? reason,
  }) async {
    await _reauthenticateForSensitiveAction(currentPassword);
    await _call('deactivateCustomerAccount', <String, dynamic>{
      if (reason != null) 'reason': reason.trim(),
    });
    await _signOut();
  }

  @override
  Future<void> revokeAllSessions({String? currentPassword}) {
    final uid = _user.uid;
    return AuthOperationCoordinator.shared.transition(() async {
      _requirePasswordOwner(uid);
      await _revokeAllSessionsCoordinated(currentPassword: currentPassword);
    });
  }

  Future<void> _revokeAllSessionsCoordinated({String? currentPassword}) async {
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

  Never _throwMapped(
    Object error,
    StackTrace stackTrace, {
    bool logDetails = true,
  }) {
    if (error is CustomerAccountException) throw error;
    if (logDetails) {
      secureDebugLog(
        'Customer account operation failed',
        error: error,
        stackTrace: stackTrace,
      );
    }
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
