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
  int acceptCalls = 0;

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
  Future<void> acceptConsent(String uid) async {
    expect(uid, identity.uid);
    acceptCalls++;
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

  Widget widget() => CustomerAuthenticationScope(
    controller: controller,
    child: MaterialApp(
      navigatorKey: navigatorKey,
      home: AuthenticationGate(
        controller: controller,
        consentDocumentLoader: (_) async => {
          'version': '2026-07-29',
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
      await tapVisible(tester, find.text('Return to login'));
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
        await tapVisible(tester, find.text('Return to login'));
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
      await tapVisible(tester, find.byType(CheckboxListTile).first);
      await tapVisible(tester, find.byType(CheckboxListTile).last);
      await tapVisible(tester, find.text('Accept and continue'));
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
    expect(find.text('Cancel sign-in'), findsOneWidget);
    await tester.tap(find.text('Cancel sign-in'));
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
    expect(find.text('Sign out and browse as guest'), findsOneWidget);
    harness.repository.failSignOut = false;
    await tapVisible(tester, find.text('Sign out and browse as guest'));
    expect(find.text('Guest browsing'), findsOneWidget);
    await harness.close(tester);
  });
}
