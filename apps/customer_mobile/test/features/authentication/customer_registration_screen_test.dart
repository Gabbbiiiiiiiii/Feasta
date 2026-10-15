import 'dart:async';
import 'package:feasta/features/presentation/screens/legal_document_screen.dart';
import 'package:feasta/features/authentication/domain/customer_login.dart';
import 'package:feasta/features/authentication/domain/customer_registration.dart';
import 'package:feasta/features/presentation/screens/customer_register_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> policy(String version) => {
  'name': 'Published agreement',
  'version': version,
  'sections': [
    {
      'title': 'Published section',
      'paragraphs': ['Exact published text'],
    },
  ],
};

Future<void> acceptAndSubmit(WidgetTester tester, {bool settle = true}) async {
  final fields = find.byType(TextFormField);
  for (var index = 0; index < 5; index++) {
    await tester.enterText(
      fields.at(index),
      ['A', 'B', 'a@b.test', 'secret1', 'secret1'][index],
    );
  }
  for (final key in ['terms-consent', 'privacy-consent']) {
    final tile = find.descendant(
      of: find.byKey(Key(key)),
      matching: find.byType(CheckboxListTile),
    );
    await tester.ensureVisible(tile);
    await tester.tap(tile);
    await tester.pump();
  }
  final button = find.byKey(const Key('create-customer-account'));
  await tester.ensureVisible(button);
  await tester.tap(button);
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

void main() {
  testWidgets(
    'policy replacement while pending resets consent and ignores stale completion',
    (tester) async {
      final gateway = ScreenFakeGateway()..release = Completer<void>();
      var completed = false;
      Widget screen(String version) => MaterialApp(
        home: CustomerRegisterScreen(
          registrationGateway: gateway,
          googleLoginGateway: ScreenLoginGateway(),
          legalDocumentLoader: (_) async => policy(version),
          onRegistrationComplete: (_) {
            completed = true;
          },
        ),
      );
      await tester.pumpWidget(screen('old'));
      await tester.pumpAndSettle();
      await acceptAndSubmit(tester, settle: false);
      expect(gateway.calls, 1);
      await tester.pumpWidget(screen('new'));
      await tester.pump();
      gateway.release!.complete();
      await tester.pumpAndSettle();
      expect(completed, isFalse);
      expect(gateway.input!.termsPolicyVersion, 'old');
      expect(find.text('Terms of Service ? Version new'), findsOneWidget);
      for (final tile in tester.widgetList<CheckboxListTile>(
        find.byType(CheckboxListTile),
      )) {
        expect(tile.value, isFalse);
      }
    },
  );

  for (final failure in [
    CustomerRegistrationFailureKind.policyOutdated,
    CustomerRegistrationFailureKind.consentRequired,
    CustomerRegistrationFailureKind.policyUnavailable,
    CustomerRegistrationFailureKind.invalidPolicyVersion,
  ]) {
    testWidgets(
      '$failure reloads both policies and requires fresh acceptance',
      (tester) async {
        var version = '1.1';
        var loads = 0;
        final gateway = ScreenFakeGateway()..failure = failure;
        await tester.pumpWidget(
          MaterialApp(
            home: CustomerRegisterScreen(
              registrationGateway: gateway,
              googleLoginGateway: ScreenLoginGateway(),
              onRegistrationComplete: (_) {},
              legalDocumentLoader: (_) async {
                loads++;
                return policy(version);
              },
            ),
          ),
        );
        await tester.pumpAndSettle();
        version = 'future-2';
        await acceptAndSubmit(tester);
        expect(gateway.input!.termsPolicyVersion, '1.1');
        expect(gateway.input!.privacyPolicyVersion, '1.1');
        expect(loads, 4);
        expect(gateway.calls, 1);
        for (final tile in tester.widgetList<CheckboxListTile>(
          find.byType(CheckboxListTile),
        )) {
          expect(tile.value, isFalse);
        }
        expect(
          find.text('Terms of Service ? Version future-2'),
          findsOneWidget,
        );
        gateway.failure = null;
        await acceptAndSubmit(tester);
        expect(gateway.calls, 2);
        expect(gateway.input!.termsPolicyVersion, 'future-2');
      },
    );
  }

  testWidgets(
    'loading disables both unchecked acceptances and creation; close remains available',
    (tester) async {
      final pending = Completer<Map<String, dynamic>?>();
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerRegisterScreen(
            registrationGateway: ScreenFakeGateway(),
            googleLoginGateway: ScreenLoginGateway(),
            legalDocumentLoader: (_) => pending.future,
          ),
        ),
      );
      for (final tile in tester.widgetList<CheckboxListTile>(
        find.byType(CheckboxListTile),
      )) {
        expect(tile.value, isFalse);
        expect(tile.onChanged, isNull);
      }
      expect(
        tester
            .widget<IconButton>(
              find.byWidgetPredicate(
                (widget) =>
                    widget is IconButton &&
                    widget.tooltip == 'Close registration',
              ),
            )
            .onPressed,
        isNotNull,
      );
      await tester.pumpWidget(const SizedBox());
      pending.complete(policy('1.1'));
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );
  for (final invalid in [
    null,
    <String, dynamic>{},
    policy(' '),
    {...policy('1'), 'sections': []},
    {
      ...policy('1'),
      'sections': [
        {'title': 'A', 'paragraphs': []},
      ],
    },
  ]) {
    testWidgets('malformed or missing policy blocks consent $invalid', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerRegisterScreen(
            registrationGateway: ScreenFakeGateway(),
            googleLoginGateway: ScreenLoginGateway(),
            legalDocumentLoader: (_) async => invalid,
          ),
        ),
      );
      await tester.pumpAndSettle();
      for (final tile in tester.widgetList<CheckboxListTile>(
        find.byType(CheckboxListTile),
      )) {
        expect(tile.onChanged, isNull);
      }
      expect(find.text('Retry policies'), findsOneWidget);
    });
  }
  testWidgets(
    'links open captured published content despite later publication',
    (tester) async {
      var version = 'future-8';
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerRegisterScreen(
            registrationGateway: ScreenFakeGateway(),
            googleLoginGateway: ScreenLoginGateway(),
            legalDocumentLoader: (_) async => policy(version),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Terms of Service ? Version future-8'), findsOneWidget);
      version = 'future-9';
      await tester.ensureVisible(find.text('Read Terms of Service'));
      await tester.tap(find.text('Read Terms of Service'));
      await tester.pumpAndSettle();
      expect(find.byType(LegalDocumentScreen), findsOneWidget);
      expect(find.text('Version future-8'), findsOneWidget);
      expect(find.text('Exact published text'), findsOneWidget);
      expect(find.text('Version future-9'), findsNothing);
    },
  );

  testWidgets('form exposes labels, consent errors, and password controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerRegisterScreen(
          legalDocumentLoader: (_) async => {
            'name': 'Published policy',
            'version': '1.1',
            'sections': [
              {
                'title': 'Agreement',
                'paragraphs': ['Published content'],
              },
            ],
          },
          registrationGateway: ScreenFakeGateway(),
          googleLoginGateway: ScreenLoginGateway(),
          onRegistrationComplete: (_) {},
        ),
      ),
    );

    await tester.pumpAndSettle();
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

  testWidgets(
    'valid accessible form submits once with normalized customer data',
    (tester) async {
      final gateway = ScreenFakeGateway();
      CustomerRegistrationResult? completed;

      await tester.pumpWidget(
        MaterialApp(
          home: CustomerRegisterScreen(
            legalDocumentLoader: (_) async => {
              'name': 'Published policy',
              'version': '1.1',
              'sections': [
                {
                  'title': 'Agreement',
                  'paragraphs': ['Published content'],
                },
              ],
            },
            registrationGateway: gateway,
            googleLoginGateway: ScreenLoginGateway(),
            onRegistrationComplete: (result) {
              completed = result;
            },
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

      expect(gateway.calls, 1);
      expect(gateway.input?.firstName, 'Ana');
      expect(gateway.input?.lastName, 'Cruz');
      expect(gateway.input?.termsPolicyVersion, '1.1');
      expect(gateway.input?.privacyPolicyVersion, '1.1');
      expect(gateway.input?.email, 'ana@feasta.test');
      expect(gateway.input?.acceptedTerms, isTrue);
      expect(gateway.input?.acceptedPrivacy, isTrue);
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
            legalDocumentLoader: (_) async => {
              'name': 'Published policy',
              'version': '1.1',
              'sections': [
                {
                  'title': 'Agreement',
                  'paragraphs': ['Published content'],
                },
              ],
            },
            registrationGateway: ScreenFakeGateway(),
            googleLoginGateway: ScreenLoginGateway(),
            onRegistrationComplete: (_) {},
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
  CustomerRegistrationFailureKind? failure;
  Completer<void>? release;
  int calls = 0;
  CustomerRegistrationInput? input;

  @override
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput input,
  ) async {
    calls++;
    this.input = input;
    if (release != null) await release!.future;
    if (failure != null) throw CustomerRegistrationException(failure!);

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
