enum PhoneVerificationFailureKind {
  invalidPhone,
  invalidCode,
  expiredCode,
  tooManyRequests,
  phoneAlreadyInUse,
  sessionExpired,
  blocked,
  network,
  configuration,
  unknown,
}

class PhoneVerificationException implements Exception {
  const PhoneVerificationException(this.kind);
  final PhoneVerificationFailureKind kind;
}

typedef FeastaPhoneCodeSent =
    void Function(String verificationId, int? resendToken);
typedef FeastaPhoneVerificationCompleted = Future<void> Function();
typedef FeastaPhoneVerificationFailed =
    void Function(PhoneVerificationException error);

abstract interface class PhoneVerificationGateway {
  Future<void> requestCode({
    required String phoneNumber,
    int? resendToken,
    required FeastaPhoneCodeSent onCodeSent,
    required FeastaPhoneVerificationCompleted onVerified,
    required FeastaPhoneVerificationFailed onFailure,
    required void Function(String verificationId) onTimeout,
  });

  Future<void> confirmCode({
    required String verificationId,
    required String smsCode,
  });
}

String? normalizePhilippineMobile(String input) {
  final compact = input.trim().replaceAll(RegExp(r'[\s()-]'), '');
  final normalized = switch (compact) {
    final value when RegExp(r'^\+639\d{9}$').hasMatch(value) => value,
    final value when RegExp(r'^639\d{9}$').hasMatch(value) => '+$value',
    final value when RegExp(r'^09\d{9}$').hasMatch(value) =>
      '+63${value.substring(1)}',
    final value when RegExp(r'^9\d{9}$').hasMatch(value) => '+63$value',
    _ => null,
  };
  return normalized;
}

String maskPhilippineMobile(String phoneNumber) {
  final normalized = normalizePhilippineMobile(phoneNumber);
  if (normalized == null) return 'your mobile number';
  return '${normalized.substring(0, 5)} *** **${normalized.substring(normalized.length - 2)}';
}
