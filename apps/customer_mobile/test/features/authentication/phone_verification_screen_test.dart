import 'package:feasta/features/authentication/application/phone_verification_controller.dart';
import 'package:feasta/features/authentication/domain/phone_verification.dart';
import 'package:feasta/features/customer/phone_verification_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'booking phone gate validates, verifies, refreshes, and resumes',
    (tester) async {
      final gateway = ScreenPhoneGateway();
      final controller = PhoneVerificationController(gateway: gateway);
      var verifiedCallbacks = 0;
      var refreshCalls = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => Navigator.push<bool>(
                context,
                MaterialPageRoute(
                  builder: (_) => PhoneVerificationScreen(
                    controller: controller,
                    requiredForBooking: true,
                    onAccountRefresh: () async => refreshCalls++,
                    onVerified: () => verifiedCallbacks++,
                  ),
                ),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '09171234567');
      await tester.tap(find.byKey(const Key('phone-verification-primary')));
      await tester.pump();
      expect(find.byKey(const Key('phone-otp-field')), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('phone-otp-field')),
        '123456',
      );
      await tester.pumpAndSettle();
      expect(verifiedCallbacks, 1);
      expect(refreshCalls, 1);
      expect(find.text('Open'), findsOneWidget);
      controller.dispose();
    },
  );

  testWidgets('phone gate remains usable at 360 px and large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: MaterialApp(
          home: PhoneVerificationScreen(
            controller: PhoneVerificationController(
              gateway: ScreenPhoneGateway(),
            ),
          ),
        ),
      ),
    );
    expect(find.text('Philippine mobile number *'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class ScreenPhoneGateway implements PhoneVerificationGateway {
  @override
  Future<void> requestCode({
    required String phoneNumber,
    int? resendToken,
    required FeastaPhoneCodeSent onCodeSent,
    required FeastaPhoneVerificationCompleted onVerified,
    required FeastaPhoneVerificationFailed onFailure,
    required void Function(String verificationId) onTimeout,
  }) async => onCodeSent('verification-id', 1);

  @override
  Future<void> confirmCode({
    required String verificationId,
    required String smsCode,
  }) async {}
}
