import 'dart:async';
import 'package:feasta/app/router/customer_route_guard.dart';
import 'package:feasta/core/theme/app_theme.dart';
import 'package:feasta/core/widgets/widgets.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/application/customer_auth_scope.dart';
import 'package:feasta/features/authentication/domain/account_recovery.dart';
import 'package:feasta/features/presentation/screens/forgot_password_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'authentication_gate_widget_test.dart' show WidgetFakeRepository;

class ResetGateway implements PasswordResetGateway {
  int requests = 0;
  Completer<void>? pending;
  AccountRecoveryFailureKind? failure;
  @override
  Future<void> requestPasswordReset(String email) async {
    requests++;
    await pending?.future;
    if (failure != null) throw AccountRecoveryException(failure!);
  }
}

Future<void> mount(
  WidgetTester tester,
  ResetGateway gateway, {
  bool large = false,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      builder: large
          ? (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            )
          : null,
      home: ForgotPasswordScreen(resetGateway: gateway),
    ),
  );
}

Future<void> tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pump();
}

Future<void> submit(WidgetTester tester) async {
  await tester.enterText(find.byType(TextFormField), 'customer@feasta.test');
  await tap(tester, find.byKey(const Key('request-password-reset')));
}

void main() {
  testWidgets(
    'loading shows progress, correct wording, and blocks duplicate requests',
    (tester) async {
      final gateway = ResetGateway()..pending = Completer<void>();
      await mount(tester, gateway);
      await submit(tester);
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Sending reset link\u2026'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(
        tester
            .widget<FeastaPrimaryButton>(
              find.byKey(const Key('request-password-reset')),
            )
            .onPressed,
        isNull,
      );
      expect(find.byKey(const Key('password-reset-success')), findsNothing);
      await tester.tap(find.byKey(const Key('request-password-reset')));
      expect(gateway.requests, 1);
      gateway.pending!.complete();
      await tester.pumpAndSettle();
    },
  );
  testWidgets(
    'successful request prominently confirms with privacy-safe copy and primary navigation',
    (tester) async {
      await mount(tester, ResetGateway());
      await submit(tester);
      await tester.pumpAndSettle();
      expect(find.text('Check your email'), findsOneWidget);
      expect(find.byIcon(Icons.mark_email_read_rounded), findsOneWidget);
      expect(find.textContaining('If a FEASTA account exists'), findsOneWidget);
      expect(
        tester
            .widget<FeastaPrimaryButton>(
              find.byKey(const Key('password-reset-back-to-sign-in')),
            )
            .label,
        'Back to sign in',
      );
      expect(find.text('Resend reset link'), findsOneWidget);
      expect(
        tester
            .widget<Semantics>(find.byKey(const Key('password-reset-success')))
            .properties
            .liveRegion,
        isTrue,
      );
    },
  );
  for (final failure in [
    AccountRecoveryFailureKind.network,
    AccountRecoveryFailureKind.configuration,
    AccountRecoveryFailureKind.tooManyRequests,
    AccountRecoveryFailureKind.unknown,
    AccountRecoveryFailureKind.invalidEmail,
  ]) {
    testWidgets(
      '$failure is visible and never displays a success confirmation',
      (tester) async {
        await mount(tester, ResetGateway()..failure = failure);
        await submit(tester);
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('password-reset-success')), findsNothing);
        expect(find.text('Check your email'), findsNothing);
        expect(find.byIcon(Icons.mark_email_read_rounded), findsNothing);
        expect(
          failure == AccountRecoveryFailureKind.invalidEmail
              ? find.text('Enter a valid email address.')
              : find.byKey(const Key('password-reset-error')),
          findsOneWidget,
        );
      },
    );
  }
  testWidgets('failed resend clears old success and allows a fresh retry', (
    tester,
  ) async {
    final gateway = ResetGateway();
    await mount(tester, gateway);
    await submit(tester);
    await tester.pumpAndSettle();
    gateway.pending = Completer<void>();
    gateway.failure = AccountRecoveryFailureKind.network;
    await tap(tester, find.byKey(const Key('resend-password-reset')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Check your email'), findsNothing);
    expect(find.text('Sending reset link\u2026'), findsOneWidget);
    gateway.pending!.complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('password-reset-error')), findsOneWidget);
    expect(find.byKey(const Key('password-reset-success')), findsNothing);
    gateway.pending = null;
    gateway.failure = null;
    await tap(tester, find.byKey(const Key('request-password-reset')));
    await tester.pumpAndSettle();
    expect(find.text('Check your email'), findsOneWidget);
    expect(gateway.requests, 3);
  });
  testWidgets('primary success action returns to the gate-owned sign-in root', (
    tester,
  ) async {
    final repository = WidgetFakeRepository();
    final controller = CustomerAuthenticationController(
      repository: repository,
      initialLocation: CustomerAppLocations.login,
    );
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      CustomerAuthenticationScope(
        controller: controller,
        child: MaterialApp(
          navigatorKey: navigator,
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        ForgotPasswordScreen(resetGateway: ResetGateway()),
                  ),
                ),
                child: const Text('Sign-in root'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Sign-in root'));
    await tester.pumpAndSettle();
    await submit(tester);
    await tester.pumpAndSettle();
    await tap(tester, find.byKey(const Key('password-reset-back-to-sign-in')));
    await tester.pumpAndSettle();
    expect(find.text('Sign-in root'), findsOneWidget);
    expect(navigator.currentState!.canPop(), isFalse);
    expect(controller.intendedLocation, CustomerAppLocations.login);
    controller.dispose();
    await repository.close();
  });
  testWidgets(
    'form, success, and errors remain scrollable at 360px and 200 percent text',
    (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final gateway = ResetGateway();
      await mount(tester, gateway, large: true);
      await submit(tester);
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('password-reset-back-to-sign-in')),
      );
      gateway.failure = AccountRecoveryFailureKind.configuration;
      await tap(tester, find.byKey(const Key('resend-password-reset')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('password-reset-error')));
      expect(tester.takeException(), isNull);
    },
  );
}
