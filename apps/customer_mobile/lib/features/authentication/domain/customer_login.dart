enum CustomerLoginFailureKind {
  invalidCredentials,
  invalidEmail,
  tooManyRequests,
  network,
  cancelled,
  blocked,
  disabled,
  unsupportedRole,
  missingProfile,
  sessionExpired,
  configuration,
  unknown,
}

class CustomerLoginException implements Exception {
  const CustomerLoginException(this.kind);

  final CustomerLoginFailureKind kind;
}

class CustomerLoginResult {
  const CustomerLoginResult({
    required this.uid,
    required this.email,
    required this.emailVerified,
  });

  final String uid;
  final String? email;
  final bool emailVerified;
}

abstract interface class CustomerLoginGateway {
  Future<CustomerLoginResult> signInWithEmail({
    required String email,
    required String password,
  });

  Future<CustomerLoginResult> signInWithGoogle();
}
