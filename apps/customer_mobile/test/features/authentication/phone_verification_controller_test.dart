import 'package:feasta/features/authentication/application/phone_verification_controller.dart';
import 'package:feasta/features/authentication/domain/phone_verification.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('normalizes accepted Philippine mobile formats', () {
    expect(normalizePhilippineMobile('+639171234567'), '+639171234567');
    expect(normalizePhilippineMobile('0917 123 4567'), '+639171234567');
    expect(normalizePhilippineMobile('9171234567'), '+639171234567');
    expect(normalizePhilippineMobile('639171234567'), '+639171234567');
    expect(normalizePhilippineMobile('08171234567'), isNull);
    expect(normalizePhilippineMobile('+12025550123'), isNull);
  });

  test(
    'OTP success persists through gateway and marks state verified',
    () async {
      final gateway = FakePhoneGateway();
      final controller = PhoneVerificationController(gateway: gateway);
      await controller.sendCode('09171234567');
      expect(gateway.requestedPhone, '+639171234567');
      expect(controller.state.verificationId, 'verification-id');
      expect(await controller.confirmCode('123456'), isTrue);
      expect(gateway.confirmedCode, '123456');
      expect(controller.state.isVerified, isTrue);
      controller.dispose();
    },
  );

  test('invalid and expired OTP errors remain actionable', () async {
    for (final entry in {
      PhoneVerificationFailureKind.invalidCode: 'incorrect',
      PhoneVerificationFailureKind.expiredCode: 'expired',
    }.entries) {
      final gateway = FakePhoneGateway(confirmFailure: entry.key);
      final controller = PhoneVerificationController(gateway: gateway);
      await controller.sendCode('+639171234567');
      expect(await controller.confirmCode('123456'), isFalse);
      expect(controller.state.codeError, contains(entry.value));
      controller.dispose();
    }
  });

  test('resend cooldown prevents rapid OTP requests', () async {
    final gateway = FakePhoneGateway();
    final controller = PhoneVerificationController(gateway: gateway);
    await controller.sendCode('09171234567');
    await controller.sendCode('09171234567', resend: true);
    expect(gateway.requestCalls, 1);
    expect(controller.state.cooldownSeconds, greaterThan(0));
    controller.dispose();
  });

  test('attempt, association, session, and blocked errors are typed', () async {
    for (final entry in {
      PhoneVerificationFailureKind.tooManyRequests: 'Too many',
      PhoneVerificationFailureKind.phoneAlreadyInUse: 'another account',
      PhoneVerificationFailureKind.sessionExpired: 'session expired',
      PhoneVerificationFailureKind.blocked: 'cannot verify',
    }.entries) {
      final controller = PhoneVerificationController(
        gateway: FakePhoneGateway(requestFailure: entry.key),
      );
      await controller.sendCode('09171234567');
      expect(controller.state.error, contains(entry.value));
      controller.dispose();
    }
  });
}

class FakePhoneGateway implements PhoneVerificationGateway {
  FakePhoneGateway({this.requestFailure, this.confirmFailure});
  final PhoneVerificationFailureKind? requestFailure;
  final PhoneVerificationFailureKind? confirmFailure;
  int requestCalls = 0;
  String? requestedPhone;
  String? confirmedCode;

  @override
  Future<void> requestCode({
    required String phoneNumber,
    int? resendToken,
    required FeastaPhoneCodeSent onCodeSent,
    required FeastaPhoneVerificationCompleted onVerified,
    required FeastaPhoneVerificationFailed onFailure,
    required void Function(String verificationId) onTimeout,
  }) async {
    requestCalls++;
    requestedPhone = phoneNumber;
    if (requestFailure != null) {
      throw PhoneVerificationException(requestFailure!);
    }
    onCodeSent('verification-id', 17);
  }

  @override
  Future<void> confirmCode({
    required String verificationId,
    required String smsCode,
  }) async {
    confirmedCode = smsCode;
    if (confirmFailure != null) {
      throw PhoneVerificationException(confirmFailure!);
    }
  }
}
