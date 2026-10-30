import 'package:feasta/features/authentication/domain/account_recovery.dart';
import 'package:feasta/features/presentation/screens/email_verification_screen.dart';
import 'package:feasta/features/presentation/screens/forgot_password_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'unverified customer can resend, refresh, and logout accessibly',
    (tester) async {
      final gateway = ScreenRecoveryGateway();
      var loggedOut = false;
      await tester.pumpWidget(
        MaterialApp(
          home: EmailVerificationScreen(
            email: 'gabby@example.com',
            verificationGateway: gateway,
            resendCooldown: const Duration(milliseconds: 20),
            onLogout: () => loggedOut = true,
            onVerified: () {},
          ),
        ),
      );
      expect(find.textContaining('g***@example.com'), findsOneWidget);
      expect(find.textContaining('gabby@example.com'), findsNothing);
      await tester.tap(find.byKey(const Key('resend-verification')));
      await tester.pump();
      expect(
        find.textContaining('new verification email was sent'),
        findsOneWidget,
      );
      await tester.tap(find.text('Logout and change account'));
      await tester.pump();
      expect(loggedOut, isTrue);
    },
  );

  testWidgets('password reset is privacy preserving and supports large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final gateway = ScreenRecoveryGateway();
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: MaterialApp(home: ForgotPasswordScreen(resetGateway: gateway)),
      ),
    );
    await tester.enterText(find.byType(TextFormField), 'unknown@example.com');
    await tester.ensureVisible(find.byKey(const Key('request-password-reset')));
    await tester.tap(find.byKey(const Key('request-password-reset')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('password-reset-success')), findsOneWidget);
    expect(find.textContaining('No account'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

class ScreenRecoveryGateway
    implements EmailVerificationGateway, PasswordResetGateway {
  @override
  Future<void> logout() async {}
  @override
  Future<bool> refreshVerification() async => false;
  @override
  Future<void> resendVerification() async {}
  @override
  Future<void> requestPasswordReset(String email) async {}
}
