import 'package:feasta/features/authentication/domain/customer_login.dart';
import 'package:feasta/features/authentication/domain/customer_registration.dart';
import 'package:feasta/features/presentation/screens/customer_register_screen.dart';
import 'package:flutter/material.dart';
import 'package:feasta/features/presentation/screens/legal_document_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('form exposes labels, consent errors, and password controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerRegisterScreen(
          legalDocumentLoader: (document) async => {
            'version': document == FeastaLegalDocument.termsOfService
                ? 'T-7'
                : 'P-3',
            'name': 'Current published agreement',
            'sections': [
              {
                'title': 'Agreement',
                'paragraphs': ['Published terms'],
              },
            ],
          },
          registrationGateway: ScreenFakeGateway(),
          googleLoginGateway: ScreenLoginGateway(),
          onRegistrationComplete: (_) {},
          onOpenTerms: () {},
          onOpenPrivacy: () {},
        ),
      ),
    );

    expect(find.text('First name *'), findsOneWidget);
    expect(find.text('Email address *'), findsOneWidget);
    expect(find.byTooltip('Show password'), findsNWidgets(2));

    expect(find.textContaining('Terms of Service'), findsWidgets);

    expect(find.textContaining('Privacy Policy'), findsWidgets);

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

  for (final stale in [false, true]) {
    testWidgets(
      'registration displays exact versions and recovers from stale consent: $stale',
      (tester) async {
        final gateway = ScreenFakeGateway()..failOnce = stale;
        CustomerRegistrationResult? completed;

        await tester.pumpWidget(
          MaterialApp(
            home: CustomerRegisterScreen(
              legalDocumentLoader: (document) async => {
                'version': document == FeastaLegalDocument.termsOfService
                    ? (stale && gateway.calls > 0 ? 'T-8' : 'T-7')
                    : 'P-3',
                'name': 'Current published agreement',
                'sections': [
                  {
                    'title': 'Agreement',
                    'paragraphs': ['Published terms'],
                  },
                ],
              },
              registrationGateway: gateway,
              googleLoginGateway: ScreenLoginGateway(),
              onRegistrationComplete: (result) {
                completed = result;
              },
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

        await tester.ensureVisible(find.byKey(const Key('terms-consent')));

        await tester.tap(find.byKey(const Key('terms-consent')));

        await tester.tap(find.byKey(const Key('privacy-consent')));

        await tester.ensureVisible(
          find.byKey(const Key('create-customer-account')),
        );

        await tester.tap(find.byKey(const Key('create-customer-account')));

        await tester.pumpAndSettle();
        expect(find.text('Accept and continue'), findsOneWidget);
        {
          await tester.ensureVisible(find.byType(CheckboxListTile).at(0));
          await tester.tap(find.byType(CheckboxListTile).at(0));
          await tester.ensureVisible(find.byType(CheckboxListTile).at(1));
          await tester.tap(find.byType(CheckboxListTile).at(1));
          await tester.pump();
          await tester.ensureVisible(find.text('Accept and continue'));
          await tester.tap(find.text('Accept and continue'));
          await tester.pumpAndSettle();
        }

        if (stale) {
          expect(gateway.calls, 1);
          expect(
            find.textContaining('Submission was not confirmed'),
            findsOneWidget,
          );
          expect(
            tester
                .widget<CheckboxListTile>(find.byType(CheckboxListTile).at(0))
                .value,
            isFalse,
          );
          expect(
            tester
                .widget<CheckboxListTile>(find.byType(CheckboxListTile).at(1))
                .value,
            isFalse,
          );
          expect(
            tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
            isNull,
          );
          await tester.ensureVisible(find.byType(CheckboxListTile).at(0));
          await tester.tap(find.byType(CheckboxListTile).at(0));
          await tester.ensureVisible(find.byType(CheckboxListTile).at(1));
          await tester.tap(find.byType(CheckboxListTile).at(1));
          await tester.pump();
          await tester.ensureVisible(find.text('Accept and continue'));
          await tester.tap(find.text('Accept and continue'));
          await tester.pumpAndSettle();
        }
        expect(gateway.calls, stale ? 2 : 1);
        expect(gateway.input?.firstName, 'Ana');
        expect(gateway.input?.lastName, 'Cruz');
        expect(gateway.input?.email, 'ana@feasta.test');
        expect(gateway.input?.acceptedTerms, isTrue);
        expect(gateway.input?.acceptedPrivacy, isTrue);
        expect(gateway.input?.termsPolicyVersion, stale ? 'T-8' : 'T-7');
        expect(gateway.input?.privacyPolicyVersion, 'P-3');
        expect(completed?.email, 'ana@feasta.test');
      },
    );
  }
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
            legalDocumentLoader: (document) async => {
              'version': document == FeastaLegalDocument.termsOfService
                  ? 'T-7'
                  : 'P-3',
              'name': 'Current published agreement',
              'sections': [
                {
                  'title': 'Agreement',
                  'paragraphs': ['Published terms'],
                },
              ],
            },
            registrationGateway: ScreenFakeGateway(),
            googleLoginGateway: ScreenLoginGateway(),
            onRegistrationComplete: (_) {},
            onOpenTerms: () {},
            onOpenPrivacy: () {},
          ),
        ),
      ),
    );

    expect(find.byType(CustomerRegisterScreen), findsOneWidget);

    expect(find.byType(SingleChildScrollView), findsOneWidget);

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
  bool failOnce = false;
  CustomerRegistrationInput? input;

  @override
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput input,
  ) async {
    calls++;
    this.input = input;
    if (failOnce && calls == 1) {
      throw const CustomerRegistrationException(
        CustomerRegistrationFailureKind.profileCreation,
      );
    }

    return CustomerRegistrationResult(
      email: input.email,
      verificationEmailSent: true,
    );
  }
}

class ScreenLoginGateway implements CustomerLoginGateway {
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
  Future<CustomerLoginResult> signInWithGoogle() async {
    return const CustomerLoginResult(
      uid: 'customer-one',
      email: 'customer@feasta.test',
      emailVerified: true,
    );
  }
}
