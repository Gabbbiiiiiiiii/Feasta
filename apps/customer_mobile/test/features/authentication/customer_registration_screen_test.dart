import 'package:feasta/features/authentication/domain/customer_registration.dart';
import 'package:feasta/features/presentation/screens/customer_register_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('form exposes labels, consent errors, and password controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerRegisterScreen(
          registrationGateway: ScreenFakeGateway(),
          onRegistrationComplete: (_) {},
          onOpenTerms: () {},
          onOpenPrivacy: () {},
        ),
      ),
    );

    expect(find.text('First name *'), findsOneWidget);
    expect(find.text('Email address *'), findsOneWidget);
    expect(find.byTooltip('Show password'), findsNWidgets(2));
    expect(find.text('Read Terms of Service'), findsOneWidget);
    expect(find.text('Read Privacy Policy'), findsOneWidget);

    await tester.ensureVisible(
      find.byKey(const Key('create-customer-account')),
    );
    await tester.tap(find.byKey(const Key('create-customer-account')));
    await tester.pump();
    expect(
      find.text('Accept the Terms of Service to continue.'),
      findsOneWidget,
    );
    expect(find.text('Accept the Privacy Policy to continue.'), findsOneWidget);
  });

  testWidgets(
    'valid accessible form submits once with normalized customer data',
    (tester) async {
      final gateway = ScreenFakeGateway();
      CustomerRegistrationResult? completed;
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerRegisterScreen(
            registrationGateway: gateway,
            onRegistrationComplete: (result) => completed = result,
            onOpenTerms: () {},
            onOpenPrivacy: () {},
          ),
        ),
      );

      await tester.enterText(
        find.widgetWithText(TextFormField, 'First name *'),
        ' Ana ',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Last name *'),
        ' Cruz ',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email address *'),
        'ANA@FEASTA.TEST ',
      );
      final passwordFields = find.byType(TextFormField);
      await tester.enterText(passwordFields.at(3), 'secret1');
      await tester.enterText(passwordFields.at(4), 'secret1');
      await tester.ensureVisible(find.text('I accept the Terms of Service.'));
      await tester.tap(find.text('I accept the Terms of Service.'));
      await tester.tap(find.text('I accept the Privacy Policy.'));
      await tester.ensureVisible(
        find.byKey(const Key('create-customer-account')),
      );
      await tester.tap(find.byKey(const Key('create-customer-account')));
      await tester.pumpAndSettle();

      expect(gateway.calls, 1);
      expect(gateway.input?.email, 'ana@feasta.test');
      expect(completed?.email, 'ana@feasta.test');
    },
  );

  testWidgets('registration remains usable at 360 px and 200 percent text', (
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
          home: CustomerRegisterScreen(
            registrationGateway: ScreenFakeGateway(),
            onRegistrationComplete: (_) {},
            onOpenTerms: () {},
            onOpenPrivacy: () {},
          ),
        ),
      ),
    );
    await tester.drag(
      find.byType(SingleChildScrollView),
      const Offset(0, -600),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('create-customer-account')), findsOneWidget);
  });
}

class ScreenFakeGateway implements CustomerRegistrationGateway {
  int calls = 0;
  CustomerRegistrationInput? input;

  @override
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput input,
  ) async {
    calls++;
    this.input = input;
    return CustomerRegistrationResult(
      email: input.email,
      verificationEmailSent: true,
    );
  }
}
