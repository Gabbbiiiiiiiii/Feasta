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
