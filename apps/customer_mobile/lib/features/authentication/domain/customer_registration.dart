enum CustomerRegistrationFailureKind {
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
    this.phoneNumber = '',
  });

  final String firstName;
  final String lastName;
  final String email;
  final String password;
  final String phoneNumber;
  final bool acceptedTerms;
  final bool acceptedPrivacy;

  CustomerRegistrationInput normalized() => CustomerRegistrationInput(
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    password: password,
    phoneNumber: phoneNumber.trim(),
    acceptedTerms: acceptedTerms,
    acceptedPrivacy: acceptedPrivacy,
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
