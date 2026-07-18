import 'package:feasta/features/authentication/application/email_verification_controller.dart';
import 'package:feasta/features/authentication/application/password_reset_controller.dart';
import 'package:feasta/features/authentication/domain/account_recovery.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'resend succeeds, starts cooldown, and prevents rapid requests',
    () async {
      final gateway = FakeRecoveryGateway();
      final controller = EmailVerificationController(
        gateway: gateway,
        resendCooldown: const Duration(milliseconds: 20),
      );
      await controller.resend();
      await controller.resend();
      expect(gateway.resendCalls, 1);
      expect(controller.state.notice, contains('sent'));
      await Future<void>.delayed(const Duration(milliseconds: 30));
      await controller.resend();
      expect(gateway.resendCalls, 2);
      controller.dispose();
    },
  );

  test('resend rate limit and expired session are friendly', () async {
    for (final entry in {
      AccountRecoveryFailureKind.tooManyRequests: 'Too many',
      AccountRecoveryFailureKind.sessionExpired: 'session expired',
      AccountRecoveryFailureKind.disabled: 'disabled',
    }.entries) {
      final controller = EmailVerificationController(
        gateway: FakeRecoveryGateway(failure: entry.key),
      );
      await controller.resend();
      expect(controller.state.error, contains(entry.value));
      controller.dispose();
    }
  });

  test(
    'refresh before and after verification requests trusted token refresh',
    () async {
      final gateway = FakeRecoveryGateway();
      final controller = EmailVerificationController(gateway: gateway);
      expect(await controller.refresh(), isFalse);
      gateway.verified = true;
      expect(await controller.refresh(), isTrue);
      expect(gateway.refreshCalls, 2);
      expect(gateway.forcedTokenRefresh, isTrue);
    },
  );

  test(
    'password reset validates email and uses privacy-preserving success',
    () async {
      final gateway = FakeRecoveryGateway();
      final controller = PasswordResetController(gateway: gateway);
      await controller.submit('invalid');
      expect(controller.state.emailError, isNotNull);
      await controller.submit(' UNKNOWN@FEASTA.TEST ');
      expect(controller.state.success, isTrue);
      expect(gateway.resetEmail, 'unknown@feasta.test');
    },
  );

  test(
    'action link parser supports canonical modes and rejects malicious continuation',
    () {
      for (final mode in ['verifyEmail', 'resetPassword', 'recoverEmail']) {
        final parsed = FirebaseActionLink.parse(
          Uri.parse(
            'https://app.feasta.test/auth/action?mode=$mode&oobCode=abc',
          ),
          appHost: 'app.feasta.test',
        );
        expect(parsed.oobCode, 'abc');
      }
      expect(
        () => FirebaseActionLink.parse(
          Uri.parse(
            'https://app.feasta.test/auth/action?mode=verifyEmail&oobCode=abc&continueUrl=https%3A%2F%2Fevil.test',
          ),
          appHost: 'app.feasta.test',
        ),
        throwsFormatException,
      );
      expect(
        EmailVerificationController.messageFor(
          AccountRecoveryFailureKind.invalidActionCode,
        ),
        contains('invalid'),
      );
      expect(
        EmailVerificationController.messageFor(
          AccountRecoveryFailureKind.expiredActionCode,
        ),
        contains('expired'),
      );
    },
  );

  test('email masking avoids exposing the complete local part', () {
    expect(maskEmail('gabby@example.com'), 'g***@example.com');
    expect(maskEmail('invalid'), 'your email address');
  });
}

class FakeRecoveryGateway
    implements EmailVerificationGateway, PasswordResetGateway {
  FakeRecoveryGateway({this.failure});
  final AccountRecoveryFailureKind? failure;
  int resendCalls = 0;
  int refreshCalls = 0;
  bool verified = false;
  bool forcedTokenRefresh = false;
  String? resetEmail;

  void _fail() {
    if (failure != null) throw AccountRecoveryException(failure!);
  }

  @override
  Future<void> resendVerification() async {
    resendCalls++;
    _fail();
  }

  @override
  Future<bool> refreshVerification() async {
    refreshCalls++;
    forcedTokenRefresh = true;
    _fail();
    return verified;
  }

  @override
  Future<void> logout() async {}

  @override
  Future<void> requestPasswordReset(String email) async {
    resetEmail = email;
    _fail();
  }
}
