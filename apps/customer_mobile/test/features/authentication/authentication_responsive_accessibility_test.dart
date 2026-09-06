import 'package:feasta/features/authentication/application/phone_verification_controller.dart';
import 'package:feasta/features/authentication/domain/customer_login.dart';
import 'package:feasta/features/authentication/domain/customer_registration.dart';
import 'package:feasta/features/authentication/domain/phone_verification.dart';
import 'package:feasta/features/customer/phone_verification_screen.dart';
import 'package:feasta/features/presentation/screens/customer_register_screen.dart';
import 'package:feasta/features/presentation/screens/login_screen.dart';
import 'package:feasta/features/presentation/screens/provider_register_screen.dart';
import 'package:feasta/features/presentation/screens/role_selection_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _authenticationWidths = <double>[360, 390, 600, 768, 900];

void main() {
  for (final width in _authenticationWidths) {
    testWidgets('authentication surfaces remain usable at '
        '${width.toInt()} px and 200 percent text', (tester) async {
      tester.view.physicalSize = Size(width, 1100);
      tester.view.devicePixelRatio = 1;

      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        _largeTextApp(
          LoginScreen(
            canSkip: false,
            loginGateway: _ResponsiveLoginGateway(),
            onLoginComplete: (_) {},
          ),
        ),
      );

      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.text('Log in or sign up'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(_largeTextApp(const RoleSelectionScreen()));

      expect(find.text('How would you like to use Feasta?'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(_largeTextApp(const ProviderRegisterScreen()));

      expect(find.text('Owner account'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(
        _largeTextApp(
          CustomerRegisterScreen(
            registrationGateway: _ResponsiveRegistrationGateway(),
            googleLoginGateway: _ResponsiveLoginGateway(),
            onRegistrationComplete: (_) {},
            onOpenTerms: () {},
            onOpenPrivacy: () {},
          ),
        ),
      );

      await tester.pump();

      expect(find.byType(CustomerRegisterScreen), findsOneWidget);
      expect(find.text('Join FEASTA'), findsOneWidget);
      expect(tester.takeException(), isNull);

      final phoneController = PhoneVerificationController(
        gateway: _ResponsivePhoneGateway(),
      );

      await tester.pumpWidget(
        _largeTextApp(PhoneVerificationScreen(controller: phoneController)),
      );

      expect(find.text('Confirm your mobile number'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(const SizedBox.shrink());

      phoneController.dispose();
    });
  }

  testWidgets('OAuth, password, and OTP controls expose accessible names', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      _largeTextApp(
        LoginScreen(
          canSkip: false,
          loginGateway: _ResponsiveLoginGateway(),
          onLoginComplete: (_) {},
        ),
      ),
    );

    expect(find.bySemanticsLabel('Continue with Google'), findsOneWidget);

    expect(find.byTooltip('Show password'), findsOneWidget);

    await tester.pumpWidget(_largeTextApp(const RoleSelectionScreen()));

    expect(
      find.bySemanticsLabel(
        'Customer account. Browse, customize, and book catering services.',
      ),
      findsOneWidget,
    );

    await tester.pumpWidget(_largeTextApp(const ProviderRegisterScreen()));

    expect(find.byTooltip('Show password'), findsNWidgets(2));

    await tester.ensureVisible(find.text('Create provider account'));

    await tester.tap(find.text('Create provider account'));

    await tester.pump();

    expect(find.text('This field is required.'), findsWidgets);

    expect(tester.takeException(), isNull);

    final controller = PhoneVerificationController(
      gateway: _ResponsivePhoneGateway(),
    );

    await tester.pumpWidget(
      _largeTextApp(PhoneVerificationScreen(controller: controller)),
    );

    await tester.enterText(find.byType(TextFormField), '09171234567');

    await tester.ensureVisible(
      find.byKey(const Key('phone-verification-primary')),
    );

    await tester.tap(find.byKey(const Key('phone-verification-primary')));

    await tester.pump();

    expect(
      find.bySemanticsLabel('Six digit verification code'),
      findsOneWidget,
    );

    await tester.pumpWidget(const SizedBox.shrink());

    controller.dispose();
    semantics.dispose();
  });
}

Widget _largeTextApp(Widget home) {
  return MediaQuery(
    data: const MediaQueryData(textScaler: TextScaler.linear(2)),
    child: MaterialApp(home: home),
  );
}

class _ResponsiveLoginGateway implements CustomerLoginGateway {
  @override
  Future<CustomerLoginResult> signInWithEmail({
    required String email,
    required String password,
  }) async {
    return const CustomerLoginResult(
      uid: 'customer-one',
      email: 'customer@feasta.test',
      emailVerified: true,
    );
  }

  @override
  Future<CustomerLoginResult> signInWithGoogle() {
    return signInWithEmail(email: 'customer@feasta.test', password: '');
  }
}

class _ResponsiveRegistrationGateway implements CustomerRegistrationGateway {
  @override
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput input,
  ) async {
    return CustomerRegistrationResult(
      email: input.email,
      verificationEmailSent: true,
    );
  }
}

class _ResponsivePhoneGateway implements PhoneVerificationGateway {
  @override
  Future<void> requestCode({
    required String phoneNumber,
    int? resendToken,
    required FeastaPhoneCodeSent onCodeSent,
    required FeastaPhoneVerificationCompleted onVerified,
    required FeastaPhoneVerificationFailed onFailure,
    required void Function(String verificationId) onTimeout,
  }) async {
    onCodeSent('verification-id', 1);
  }

  @override
  Future<void> confirmCode({
    required String verificationId,
    required String smsCode,
  }) async {}
}
