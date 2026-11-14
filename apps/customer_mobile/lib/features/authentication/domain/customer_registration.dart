enum CustomerRegistrationFailureKind {
  consentRequired,
  policyOutdated,
  policyUnavailable,
  invalidPolicyVersion,
  emailAlreadyInUse,
  weakPassword,
  invalidEmail,
  network,
  tooManyRequests,
  profileCreation,
  blockedAccount,
  configuration,
  unknown,
}

class CustomerRegistrationException implements Exception {
  const CustomerRegistrationException(this.kind);

  final CustomerRegistrationFailureKind kind;
}

class CustomerRegistrationInput {
  const CustomerRegistrationInput({
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.password,
    required this.acceptedTerms,
    required this.acceptedPrivacy,
    required this.termsPolicyVersion,
    required this.privacyPolicyVersion,
    this.phoneNumber = '',
  });

  final String firstName;
  final String lastName;
  final String email;
  final String password;
  final String phoneNumber;
  final bool acceptedTerms;
  final bool acceptedPrivacy;
  final String termsPolicyVersion;
  final String privacyPolicyVersion;

  CustomerRegistrationInput normalized() => CustomerRegistrationInput(
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    password: password,
    phoneNumber: phoneNumber.trim(),
    acceptedTerms: acceptedTerms,
    acceptedPrivacy: acceptedPrivacy,
    termsPolicyVersion: termsPolicyVersion,
    privacyPolicyVersion: privacyPolicyVersion,
  );
}

class CustomerRegistrationResult {
  const CustomerRegistrationResult({
    required this.email,
    required this.verificationEmailSent,
    this.recoveredExistingIdentity = false,
  });

  final String email;
  final bool verificationEmailSent;
  final bool recoveredExistingIdentity;
}

abstract interface class CustomerRegistrationGateway {
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput input,
  );
}

CustomerRegistrationFailureKind? registrationPolicyFailure(
  String code,
  Object? details,
) {
  final reason = details is Map ? details['reason'] : null;
  return switch ((code, reason)) {
    ('failed-precondition', 'consent-required') =>
      CustomerRegistrationFailureKind.consentRequired,
    ('failed-precondition', 'policy-version-outdated') =>
      CustomerRegistrationFailureKind.policyOutdated,
    ('failed-precondition', 'policy-unavailable') =>
      CustomerRegistrationFailureKind.policyUnavailable,
    ('invalid-argument', 'invalid-policy-version') =>
      CustomerRegistrationFailureKind.invalidPolicyVersion,
    _ => null,
  };
}
