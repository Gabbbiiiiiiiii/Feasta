enum AccountRecoveryFailureKind {
  tooManyRequests,
  sessionExpired,
  disabled,
  network,
  invalidEmail,
  invalidActionCode,
  expiredActionCode,
  configuration,
  unknown,
}

class AccountRecoveryException implements Exception {
  const AccountRecoveryException(this.kind);
  final AccountRecoveryFailureKind kind;
}

abstract interface class EmailVerificationGateway {
  Future<void> resendVerification();
  Future<bool> refreshVerification();
  Future<void> logout();
}

abstract interface class PasswordResetGateway {
  Future<void> requestPasswordReset(String email);
}

enum FirebaseActionMode { verifyEmail, resetPassword, recoverEmail }

enum FirebaseActionResultKind {
  emailVerified,
  passwordResetRequired,
  emailRecovered,
}

class FirebaseActionResult {
  const FirebaseActionResult(this.kind, {this.maskedEmail});

  final FirebaseActionResultKind kind;
  final String? maskedEmail;
}

abstract interface class FirebaseActionCodeGateway {
  Future<FirebaseActionResult> handleActionCode(FirebaseActionLink link);
}

class FirebaseActionLink {
  const FirebaseActionLink({required this.mode, required this.oobCode});
  final FirebaseActionMode mode;
  final String oobCode;

  static FirebaseActionLink parse(Uri uri, {required String appHost}) {
    if (uri.scheme != 'https' ||
        uri.userInfo.isNotEmpty ||
        uri.host.toLowerCase() != appHost.toLowerCase()) {
      throw const FormatException('Untrusted authentication action link.');
    }
    final continueValue = uri.queryParameters['continueUrl'];
    if (continueValue != null) {
      final continueUri = Uri.tryParse(continueValue);
      if (continueUri == null ||
          continueUri.scheme != 'https' ||
          continueUri.userInfo.isNotEmpty ||
          continueUri.host.toLowerCase() != appHost.toLowerCase()) {
        throw const FormatException('Untrusted authentication continuation.');
      }
    }
    final code = uri.queryParameters['oobCode'];
    final mode = switch (uri.queryParameters['mode']) {
      'verifyEmail' => FirebaseActionMode.verifyEmail,
      'resetPassword' => FirebaseActionMode.resetPassword,
      'recoverEmail' => FirebaseActionMode.recoverEmail,
      _ => null,
    };
    if (code == null || code.trim().isEmpty || mode == null) {
      throw const FormatException('Invalid authentication action link.');
    }
    return FirebaseActionLink(mode: mode, oobCode: code.trim());
  }
}

String maskEmail(String email) {
  final parts = email.trim().split('@');
  if (parts.length != 2 || parts.last.isEmpty) return 'your email address';
  final local = parts.first;
  final visible = local.isEmpty ? '' : local.substring(0, 1);
  return '$visible${'*' * (local.length > 1 ? 3 : 2)}@${parts.last}';
}
