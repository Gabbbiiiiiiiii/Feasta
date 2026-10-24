enum CustomerAccountFailureKind {
  recentLoginRequired,
  invalidCredential,
  weakPassword,
  emailAlreadyInUse,
  invalidEmail,
  passwordProviderRequired,
  sessionExpired,
  blocked,
  rateLimited,
  network,
  configuration,
  unknown,
}

class CustomerAccountException implements Exception {
  const CustomerAccountException(this.kind);

  final CustomerAccountFailureKind kind;

  String get friendlyMessage => switch (kind) {
    CustomerAccountFailureKind.recentLoginRequired =>
      'Please confirm your identity before continuing.',
    CustomerAccountFailureKind.invalidCredential =>
      'Your current password is incorrect.',
    CustomerAccountFailureKind.weakPassword =>
      'Choose a stronger password with at least 8 characters.',
    CustomerAccountFailureKind.emailAlreadyInUse =>
      'That email address cannot be used. Try another address.',
    CustomerAccountFailureKind.invalidEmail => 'Enter a valid email address.',
    CustomerAccountFailureKind.passwordProviderRequired =>
      'This account uses Google sign-in. Manage its password with Google.',
    CustomerAccountFailureKind.sessionExpired =>
      'Your session has expired. Please sign in again.',
    CustomerAccountFailureKind.blocked =>
      'This account is unavailable. Contact FEASTA support for help.',
    CustomerAccountFailureKind.rateLimited =>
      'Too many attempts. Please wait before trying again.',
    CustomerAccountFailureKind.network =>
      'Check your connection and try again.',
    CustomerAccountFailureKind.configuration =>
      'Account management is temporarily unavailable.',
    CustomerAccountFailureKind.unknown =>
      'We could not complete that request. Please try again.',
  };
}

/// Password update was confirmed or dispatched; callers must not blindly retry.
class CustomerPasswordChangeException extends CustomerAccountException {
  const CustomerPasswordChangeException({
    required this.sessionsRevoked,
    required this.signedOut,
    this.accountChanged = false,
    this.updateOutcomeUncertain = false,
    this.requiresReauthentication = false,
  }) : super(CustomerAccountFailureKind.unknown);

  final bool sessionsRevoked;
  final bool signedOut;
  final bool accountChanged;
  final bool updateOutcomeUncertain;
  final bool requiresReauthentication;

  @override
  String get friendlyMessage {
    if (updateOutcomeUncertain) {
      return 'Your password change could not be confirmed. It may have changed. '
          'Do not repeat the password change. Sign in with the password that '
          'currently works, or reset it, then finish session cleanup.';
    }
    if (accountChanged) {
      return 'Your password changed, but the signed-in account changed before '
          'cleanup finished. Sign in to the original account with its new '
          'password and use Sign out all devices.';
    }
    if (sessionsRevoked && signedOut) {
      return 'Your password changed and session cleanup completed, but recovery '
          'status could not be cleared. Sign in with your current password '
          'to confirm cleanup.';
    }
    if (!sessionsRevoked) {
      if (requiresReauthentication && !signedOut) {
        return 'Your password changed, but session cleanup is pending. Confirm '
            'your identity with your current password to finish cleanup.';
      }
      return signedOut
          ? 'Your password changed and you were signed out. Revocation of all '
                'sessions could not be confirmed. Sign in with your new password '
                'and use Sign out all devices.'
          : 'Your password changed, but session revocation and sign-out could '
                'not be confirmed. Retry to finish cleanup; your password will '
                'not be changed again.';
    }
    return 'Your password changed and all sessions were revoked, but local '
        'sign-out failed. Retry to finish signing out; your password will '
        'not be changed again.';
  }
}

abstract interface class CustomerPasswordRecoveryGateway {
  Future<CustomerPasswordChangeException?> loadPasswordRecovery();
  Future<void> resumePasswordCleanup({String? currentPassword});
}

class CustomerProfileUpdate {
  const CustomerProfileUpdate({
    required this.firstName,
    required this.lastName,
    required this.address,
    required this.city,
    required this.province,
  });

  final String firstName;
  final String lastName;
  final String address;
  final String city;
  final String province;
}

class CustomerPrivacyPreferences {
  const CustomerPrivacyPreferences({
    required this.marketingConsent,
    required this.pushNotificationsEnabled,
    required this.emailNotificationsEnabled,
  });

  final bool marketingConsent;
  final bool pushNotificationsEnabled;
  final bool emailNotificationsEnabled;
}

abstract interface class CustomerAccountGateway {
  bool get supportsPasswordChanges;

  Future<void> updateProfile(CustomerProfileUpdate update);
  Future<void> updatePreferences(CustomerPrivacyPreferences preferences);
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  });
  Future<void> requestEmailUpdate({
    required String currentPassword,
    required String newEmail,
  });
  Future<void> deactivate({String? currentPassword, String? reason});
  Future<void> revokeAllSessions({String? currentPassword});
}
