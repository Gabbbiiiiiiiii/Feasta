import 'dart:async';

import 'package:feasta/app/router/customer_route_guard.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/application/customer_auth_scope.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:feasta/features/authentication/domain/account_recovery.dart';
import 'package:feasta/features/authentication/domain/customer_login.dart';
import 'package:feasta/features/authentication/domain/customer_registration.dart';
import 'package:feasta/features/authentication/presentation/authentication_gate.dart';
import 'package:feasta/features/authentication/presentation/customer_consent_screen.dart';
import 'package:feasta/features/presentation/screens/customer_register_screen.dart';
import 'package:feasta/features/presentation/screens/forgot_password_screen.dart';
import 'package:feasta/features/presentation/screens/login_screen.dart';
import 'package:feasta/features/presentation/screens/legal_document_screen.dart';
import 'package:feasta/features/presentation/screens/role_selection_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'customer_auth_controller_test.dart'
    show FakeCustomerAuthStateRepository, identity, activeProfile;

class NavigationRepository extends FakeCustomerAuthStateRepository
    implements CustomerConsentRepository {
  bool needsConsent = false;
  bool failSignOut = false;
  Completer<CustomerAccountLoadResult>? pendingBootstrap;
  Completer<void>? pendingSignOut;
  Completer<void>? pendingConsent;
  int acceptCalls = 0;
  CustomerAuthLoadFailureKind? acceptanceFailure;
  List<String>? submittedVersions;

  @override
  Future<CustomerAccountLoadResult> loadAccount({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  }) {
    if (pendingBootstrap != null) return pendingBootstrap!.future;
    if (needsConsent) {
      nextFailure = const CustomerAuthLoadFailure(
        CustomerAuthLoadFailureKind.consentRequired,
      );
    }
    return super.loadAccount(
      identity: identity,
      forceTokenRefresh: forceTokenRefresh,
    );
  }

  @override
  Future<void> acceptConsent(
    String uid, {
    required String termsPolicyVersion,
    required String privacyPolicyVersion,
  }) async {
    expect(uid, identity.uid);
    acceptCalls++;
    submittedVersions = [termsPolicyVersion, privacyPolicyVersion];
    await pendingConsent?.future;
    if (acceptanceFailure != null) {
      throw CustomerAuthLoadFailure(acceptanceFailure!);
    }
    needsConsent = false;
  }

  @override
  Future<void> signOut() async {
    if (failSignOut) throw StateError('Isolated sign-out failure');
    await pendingSignOut?.future;
    await super.signOut();
  }
}

class NavigationGateway
    implements
        CustomerLoginGateway,
        PasswordResetGateway,
        CustomerRegistrationGateway {
  NavigationGateway(this.repository);
  final NavigationRepository repository;
  int resets = 0;

  @override
  Future<CustomerLoginResult> signInWithGoogle() async {
    repository.emitAuth(identity);
    return CustomerLoginResult(
      uid: identity.uid,
      email: identity.email,
      emailVerified: true,
    );
  }

  @override
  Future<CustomerLoginResult> signInWithEmail({
    required String email,
    required String password,
  }) => signInWithGoogle();

  @override
  Future<void> requestPasswordReset(String email) async {
    resets++;
  }

  @override
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput input,
  ) async {
    repository.emitAuth(identity);
    return CustomerRegistrationResult(
      email: input.email,
      verificationEmailSent: true,
    );
  }
}

class NavigationHarness {
  NavigationHarness({String initialLocation = CustomerAppLocations.login}) {
    gateway = NavigationGateway(repository);
    controller = CustomerAuthenticationController(
      repository: repository,
      initialLocation: initialLocation,
    )..start();
  }
  final repository = NavigationRepository();
  late final NavigationGateway gateway;
  late final CustomerAuthenticationController controller;
  final navigatorKey = GlobalKey<NavigatorState>();
  String termsVersion = '1.1';
  String privacyVersion = '1.1';

  Widget widget() => CustomerAuthenticationScope(
    controller: controller,
    child: MaterialApp(
      navigatorKey: navigatorKey,
      home: AuthenticationGate(
        controller: controller,
        consentDocumentLoader: (document) async => {
          'name': 'Current policy',
          'version': document == FeastaLegalDocument.termsOfService
              ? termsVersion
              : privacyVersion,
          'sections': [
            {
              'title': 'Current policy',
              'paragraphs': ['Policy text'],
            },
          ],
        },
        publicBuilder: (_, _) => Scaffold(
          body: Column(
            children: [
              const Text('Guest browsing'),
              TextButton(
                onPressed: () => controller.requestIntendedLocation(
                  CustomerAppLocations.login,
                ),
                child: const Text('Choose another account'),
              ),
            ],
          ),
        ),
        customerBuilder: (_, _) =>
            const Scaffold(body: Text('Validated customer account')),
        loginBuilder: (_, _) => LoginScreen(
          managedByAuthenticationGate: true,
          loginGateway: gateway,
          passwordResetGateway: gateway,
          roleSelectionBuilder: (_) => RoleSelectionScreen(
            customerRegistrationBuilder: (_) => CustomerRegisterScreen(
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
              googleLoginGateway: gateway,
            ),
          ),
        ),
      ),
    ),
  );

  Future<void> mount(WidgetTester tester) async {
    await tester.pumpWidget(widget());
    repository.emitAuth(null);
    await tester.pumpAndSettle();
  }

  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
    await repository.close();
  }
}

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'password recovery preserves the intended protected destination',
    (tester) async {
      final harness = NavigationHarness(
        initialLocation: CustomerAppLocations.bookings,
      );
      await harness.mount(tester);
      await tapVisible(tester, find.text('Forgot password?'));
      await tapVisible(tester, find.text('Back to sign in'));
      expect(
        harness.controller.intendedLocation,
        CustomerAppLocations.bookings,
      );
      expect(find.byType(LoginScreen), findsOneWidget);
      await tapVisible(tester, find.byKey(const Key('google-login-button')));
      expect(find.text('Validated customer account'), findsOneWidget);
      expect(
        harness.controller.intendedLocation,
        CustomerAppLocations.bookings,
      );
      await harness.close(tester);
    },
  );
  for (final entry in {
    CustomerAuthLoadFailureKind.sessionExpired: 'Your session has expired',
    CustomerAuthLoadFailureKind.blocked: 'Account blocked',
    CustomerAuthLoadFailureKind.disabledAuthAccount: 'Account disabled',
    CustomerAuthLoadFailureKind.unsupportedRole: 'Use the correct FEASTA app',
  }.entries) {
    testWidgets(
      'Google ${entry.key} remains restricted and preserves its message',
      (tester) async {
        final harness = NavigationHarness();
        await harness.mount(tester);
        harness.repository.nextFailure = CustomerAuthLoadFailure(entry.key);
        await tapVisible(tester, find.byKey(const Key('google-login-button')));
        expect(find.text(entry.value), findsOneWidget);
        expect(harness.controller.currentIdentity, isNull);
        expect(harness.repository.signOutCount, greaterThanOrEqualTo(1));
        expect(harness.repository.listenerCount, 0);
        expect(find.text('Validated customer account'), findsNothing);
        await harness.close(tester);
      },
    );
  }

  testWidgets('guest browsing waits for confirmed sign-out', (tester) async {
    final harness = NavigationHarness();
    await harness.mount(tester);
    harness.repository.nextFailure = const CustomerAuthLoadFailure(
      CustomerAuthLoadFailureKind.callableAccess,
    );
    harness.repository.emitAuth(identity);
    await tester.pumpAndSettle();
    final release = Completer<void>();
    harness.repository.pendingSignOut = release;
    await tester.tap(find.text('Sign out and browse as guest'));
    await tester.pump();
    expect(find.text('Guest browsing'), findsNothing);
    expect(harness.controller.signingOut, true);
    expect(harness.controller.currentIdentity, isNotNull);
    release.complete();
    await tester.pumpAndSettle();
    expect(harness.controller.currentIdentity, isNull);
    expect(find.text('Guest browsing'), findsOneWidget);
    await harness.close(tester);
  });

  testWidgets('password recovery back preserves the preceding login route', (
    tester,
  ) async {
    final harness = NavigationHarness();
    await harness.mount(tester);
    await tapVisible(tester, find.text('Forgot password?'));
    expect(harness.navigatorKey.currentState!.canPop(), true);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(AuthenticationGate), findsOneWidget);
    expect(harness.navigatorKey.currentState!.canPop(), false);
    await harness.close(tester);
  });
  for (final consent in [false, true]) {
    testWidgets(
      'login -> password recovery -> login -> Google, consent=$consent',
      (tester) async {
        final harness = NavigationHarness()..repository.needsConsent = consent;
        await harness.mount(tester);
        await tapVisible(tester, find.text('Forgot password?'));
        expect(find.byType(ForgotPasswordScreen), findsOneWidget);
        await tester.enterText(
          find.byType(TextFormField),
          'customer@feasta.test',
        );
        await tapVisible(
          tester,
          find.byKey(const Key('request-password-reset')),
        );
        expect(harness.gateway.resets, 1);
        await tapVisible(tester, find.text('Back to sign in'));
        expect(harness.navigatorKey.currentState!.canPop(), false);
        expect(find.byType(LoginScreen), findsOneWidget);
        await tapVisible(tester, find.byKey(const Key('google-login-button')));
        expect(find.byType(AuthenticationGate), findsOneWidget);
        expect(
          find.byType(CustomerConsentScreen),
          consent ? findsOneWidget : findsNothing,
        );
        expect(
          find.text('Validated customer account'),
          consent ? findsNothing : findsOneWidget,
        );
        expect(harness.repository.acceptCalls, 0);
        await harness.close(tester);
      },
    );
  }

  testWidgets(
    'role selection -> registration -> Google exposes consent at the root',
    (tester) async {
      final harness = NavigationHarness()..repository.needsConsent = true;
      await harness.mount(tester);
      await tapVisible(tester, find.text('Create account'));
      expect(find.byType(RoleSelectionScreen), findsOneWidget);
      await tapVisible(tester, find.text('Customer'));
      expect(find.byType(CustomerRegisterScreen), findsOneWidget);
      await tapVisible(tester, find.byKey(const Key('google-register-button')));
      expect(harness.navigatorKey.currentState!.canPop(), false);
      expect(find.byType(RoleSelectionScreen), findsNothing);
      expect(find.byType(CustomerRegisterScreen), findsNothing);
      expect(find.byType(CustomerConsentScreen), findsOneWidget);
      expect(find.text('Validated customer account'), findsNothing);
      await tapVisible(tester, find.text('Agree and continue'));
      expect(harness.repository.acceptCalls, 1);
      expect(find.text('Validated customer account'), findsOneWidget);
      await harness.close(tester);
    },
  );

  testWidgets(
    'guest close preserves the gate and allows a later Google login',
    (tester) async {
      final harness = NavigationHarness();
      await harness.mount(tester);
      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      expect(find.text('Guest browsing'), findsOneWidget);
      expect(find.byType(AuthenticationGate), findsOneWidget);
      await tapVisible(tester, find.text('Choose another account'));
      await tapVisible(tester, find.byKey(const Key('google-login-button')));
      expect(find.text('Validated customer account'), findsOneWidget);
      await harness.close(tester);
    },
  );

  for (final failure in [
    CustomerAuthLoadFailureKind.callableAccess,
    CustomerAuthLoadFailureKind.accountAccess,
  ]) {
    testWidgets('$failure retries or signs out to guest browsing', (
      tester,
    ) async {
      final harness = NavigationHarness();
      await harness.mount(tester);
      harness.repository.nextFailure = CustomerAuthLoadFailure(failure);
      harness.repository.emitAuth(identity);
      await tester.pumpAndSettle();
      expect(find.text('Sign out and browse as guest'), findsOneWidget);
      await tapVisible(tester, find.text('Try again'));
      expect(find.text('Validated customer account'), findsOneWidget);
      harness.repository.nextFailure = CustomerAuthLoadFailure(failure);
      await harness.controller.refresh();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Sign out and browse as guest'));
      await tester.pump();
      await tester.tap(find.text('Sign out and browse as guest'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(harness.controller.signingOut, false);
      expect(harness.repository.signOutCount, 1);
      expect(harness.controller.currentIdentity, isNull);
      expect(find.text('Guest browsing'), findsOneWidget);
      await tapVisible(tester, find.text('Choose another account'));
      expect(find.byKey(const Key('google-login-button')), findsOneWidget);
      await harness.close(tester);
    });
  }

  testWidgets('cancel pending bootstrap ignores stale completion', (
    tester,
  ) async {
    final harness = NavigationHarness();
    await harness.mount(tester);
    final pending = Completer<CustomerAccountLoadResult>();
    harness.repository.pendingBootstrap = pending;
    harness.repository.emitAuth(identity);
    await tester.pump();
    await tester.pump();
    expect(find.text('Sign out and browse'), findsOneWidget);
    await tester.tap(find.text('Sign out and browse'));
    await tester.pumpAndSettle();
    expect(find.text('Guest browsing'), findsOneWidget);
    pending.complete(
      CustomerAccountLoadResult(
        identity: identity,
        userProfile: activeProfile(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Guest browsing'), findsOneWidget);
    expect(find.text('Validated customer account'), findsNothing);
    expect(harness.repository.listenerCount, 0);
    await harness.close(tester);
  });

  testWidgets('failed sign-out stays gated and remains retryable', (
    tester,
  ) async {
    final harness = NavigationHarness();
    await harness.mount(tester);
    harness.repository.nextFailure = const CustomerAuthLoadFailure(
      CustomerAuthLoadFailureKind.callableAccess,
    );
    harness.repository.emitAuth(identity);
    await tester.pumpAndSettle();
    harness.repository.failSignOut = true;
    await tapVisible(tester, find.text('Sign out and browse as guest'));
    expect(find.text('Guest browsing'), findsNothing);
    expect(harness.controller.currentIdentity, isNotNull);
    expect(find.text('Cancel sign-in and browse'), findsOneWidget);
    harness.repository.failSignOut = false;
    await tapVisible(tester, find.text('Cancel sign-in and browse'));
    expect(find.text('Guest browsing'), findsOneWidget);
    await harness.close(tester);
  });
  for (final reason in [
    CustomerAuthLoadFailureKind.consentRequired,
    CustomerAuthLoadFailureKind.policyVersionOutdated,
    CustomerAuthLoadFailureKind.policyUnavailable,
    CustomerAuthLoadFailureKind.invalidPolicyVersion,
  ]) {
    testWidgets(
      'backend $reason rejection reloads both policies for fresh affirmative action',
      (tester) async {
        final harness = NavigationHarness()..repository.needsConsent = true;
        await harness.mount(tester);
        harness.repository.emitAuth(identity);
        await tester.pumpAndSettle();
        harness.termsVersion = ' 1.2 ';
        harness.privacyVersion = 'privacy-2';
        harness.repository.acceptanceFailure = reason;
        final previousScreen = tester.widget<CustomerConsentScreen>(
          find.byType(CustomerConsentScreen),
        );
        await tapVisible(tester, find.text('Agree and continue'));
        await previousScreen.onDecline();
        await previousScreen.onAccept('1.1', '1.1');
        expect(harness.repository.submittedVersions, ['1.1', '1.1']);
        expect(find.text('Version  1.2 '), findsOneWidget);
        expect(find.text('Version privacy-2'), findsOneWidget);
        expect(
          tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
          isNotNull,
        );
        expect(
          tester
              .widgetList<CheckboxListTile>(find.byType(CheckboxListTile))
              .every((tile) => tile.value == false),
          isTrue,
        );
        expect(
          find.textContaining('Policies have changed'),
          reason == CustomerAuthLoadFailureKind.policyVersionOutdated
              ? findsOneWidget
              : findsNothing,
        );
        expect(harness.repository.signOutCount, 0);
        expect(harness.repository.acceptCalls, 1);
        expect(harness.repository.listenerCount, 0);
        harness.repository.acceptanceFailure = null;
        await tapVisible(tester, find.text('Agree and continue'));
        expect(harness.repository.submittedVersions, [' 1.2 ', 'privacy-2']);
        expect(find.text('Validated customer account'), findsOneWidget);
        await harness.close(tester);
      },
    );
  }

  for (final reason in [
    CustomerAuthLoadFailureKind.policyUnavailable,
    CustomerAuthLoadFailureKind.invalidPolicyVersion,
  ]) {
    testWidgets('$reason blocks consent until valid policy retry', (
      tester,
    ) async {
      final harness = NavigationHarness()..repository.needsConsent = true;
      await harness.mount(tester);
      harness.repository.emitAuth(identity);
      await tester.pumpAndSettle();
      harness.termsVersion = '';
      harness.repository.acceptanceFailure = reason;
      await tapVisible(tester, find.text('Agree and continue'));
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(find.text('Validated customer account'), findsNothing);
      expect(
        find.textContaining(
          reason == CustomerAuthLoadFailureKind.policyUnavailable
              ? 'temporarily unavailable'
              : 'versions could not be validated',
        ),
        findsOneWidget,
      );
      expect(harness.controller.currentIdentity?.uid, identity.uid);
      expect(harness.repository.signOutCount, 0);
      expect(harness.repository.acceptCalls, 1);
      harness.termsVersion = ' exact-terms ';
      harness.privacyVersion = 'privacy-next';
      harness.repository.acceptanceFailure = null;
      await tapVisible(tester, find.text('Retry policies'));
      expect(find.text('Version  exact-terms '), findsOneWidget);
      expect(find.text('Version privacy-next'), findsOneWidget);
      expect(
        tester
            .widgetList<CheckboxListTile>(find.byType(CheckboxListTile))
            .every((tile) => tile.value == false),
        isTrue,
      );
      expect(harness.repository.acceptCalls, 1);
      await tapVisible(tester, find.text('Agree and continue'));
      expect(harness.repository.submittedVersions, [
        ' exact-terms ',
        'privacy-next',
      ]);
      expect(find.text('Validated customer account'), findsOneWidget);
      await harness.close(tester);
    });
  }

  for (final failure in [
    CustomerAuthLoadFailureKind.network,
    CustomerAuthLoadFailureKind.callableAccess,
  ]) {
    testWidgets('consent submission $failure requires safe recovery', (
      tester,
    ) async {
      final harness = NavigationHarness()..repository.needsConsent = true;
      await harness.mount(tester);
      harness.repository.emitAuth(identity);
      await tester.pumpAndSettle();
      harness.repository.acceptanceFailure = failure;
      await tapVisible(tester, find.text('Agree and continue'));
      expect(find.text('Validated customer account'), findsNothing);
      expect(harness.repository.acceptCalls, 1);
      expect(harness.repository.listenerCount, 0);
      harness.repository.acceptanceFailure = null;
      await tapVisible(tester, find.text('Try again'));
      expect(find.byType(CustomerConsentScreen), findsOneWidget);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNotNull,
      );
      expect(harness.repository.acceptCalls, 1);
      await tapVisible(tester, find.text('Cancel sign-in'));
      expect(harness.repository.acceptCalls, 1);
      expect(find.text('Guest browsing'), findsOneWidget);
      await harness.close(tester);
    });
  }
  for (final switchAccount in [false, true]) {
    testWidgets(
      'old consent callbacks cannot submit after ${switchAccount ? "account switch" : "sign-out"}',
      (tester) async {
        final harness = NavigationHarness()..repository.needsConsent = true;
        await harness.mount(tester);
        harness.repository.emitAuth(identity);
        await tester.pumpAndSettle();
        final previous = tester.widget<CustomerConsentScreen>(
          find.byType(CustomerConsentScreen),
        );
        if (switchAccount) {
          const second = CustomerAuthIdentity(
            uid: 'customer-two',
            email: 'second@feasta.test',
            emailVerified: true,
          );
          harness.repository.emitAuth(second);
        } else {
          await harness.controller.signOut();
        }
        // Exercise even the gap before the auth stream notification is processed.
        await previous.onAccept('old-terms', 'old-privacy');
        await tester.pumpAndSettle();
        await previous.onAccept('old-terms', 'old-privacy');
        await previous.onDecline();
        expect(harness.repository.acceptCalls, 0);
        expect(harness.repository.signOutCount, switchAccount ? 0 : 1);
        expect(find.text('Validated customer account'), findsNothing);
        await harness.close(tester);
      },
    );
  }

  for (final lateFailure in [
    CustomerAuthLoadFailureKind.policyVersionOutdated,
    CustomerAuthLoadFailureKind.policyUnavailable,
    CustomerAuthLoadFailureKind.invalidPolicyVersion,
  ]) {
    testWidgets(
      'late $lateFailure submission cannot affect switched identity',
      (tester) async {
        final harness = NavigationHarness()..repository.needsConsent = true;
        await harness.mount(tester);
        harness.repository.emitAuth(identity);
        await tester.pumpAndSettle();
        final previous = tester.widget<CustomerConsentScreen>(
          find.byType(CustomerConsentScreen),
        );
        final pending = Completer<void>();
        harness.repository.pendingConsent = pending;
        harness.repository.acceptanceFailure = lateFailure;
        final submission = previous.onAccept('1.1', '1.1');
        await tester.pump();
        const second = CustomerAuthIdentity(
          uid: 'customer-two',
          email: 'second@feasta.test',
          emailVerified: true,
        );
        harness.repository.emitAuth(second);
        await tester.pumpAndSettle();
        final revision = harness.controller.consentRevision;
        pending.complete();
        await submission;
        await tester.pumpAndSettle();
        expect(harness.controller.currentIdentity?.uid, second.uid);
        expect(harness.controller.consentRevision, revision);
        expect(harness.controller.policiesOutdated, false);
        expect(harness.repository.acceptCalls, 1);
        expect(harness.repository.listenerCount, 0);
        await harness.close(tester);
      },
    );
  }
}
