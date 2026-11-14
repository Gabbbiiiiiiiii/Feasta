import 'package:feasta/features/authentication/domain/customer_login.dart';
import 'package:feasta/features/presentation/screens/login_screen.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:feasta/features/authentication/presentation/authentication_loading.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final google in [false, true]) {
    testWidgets(
      '${google ? "Google" : "Email"} uses one loading component and clears on failure',
      (tester) async {
        final gateway = PendingScreenGateway();
        await tester.pumpWidget(
          MaterialApp(
            home: LoginScreen(loginGateway: gateway, onLoginComplete: (_) {}),
          ),
        );
        if (!google) {
          await tester.enterText(find.byType(TextFormField).at(0), 'a@b.com');
          await tester.enterText(find.byType(TextFormField).at(1), 'secret1');
        }
        final button = find.byKey(
          Key(google ? 'google-login-button' : 'email-login-button'),
        );
        await tester.ensureVisible(button);
        await tester.pumpAndSettle();
        await tester.tap(button);
        await tester.pump();
        expect(find.text('Signing in...'), findsOneWidget);
        expect(find.byType(AuthenticationLoading), findsOneWidget);
        await tester.pump(const Duration(seconds: 2));
        expect(gateway.calls, 1);
        gateway.pending.completeError(
          const CustomerLoginException(CustomerLoginFailureKind.network),
        );
        await tester.pumpAndSettle();
        expect(find.byType(AuthenticationLoading), findsNothing);
        expect(find.textContaining('internet connection'), findsOneWidget);
      },
    );
  }

  testWidgets('login form exposes autofill fields and accessible errors', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(
          canSkip: false,
          loginGateway: ScreenLoginGateway(
            failure: CustomerLoginFailureKind.network,
          ),
          onLoginComplete: (_) {},
        ),
      ),
    );

    expect(find.text('Log in or sign up'), findsOneWidget);

    expect(find.text('Email address *'), findsOneWidget);

    expect(find.text('Password *'), findsOneWidget);

    expect(find.byTooltip('Show password'), findsOneWidget);

    expect(find.text('Forgot password?'), findsOneWidget);

    expect(find.text('Create account'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(0), 'a@b.com');

    await tester.enterText(find.byType(TextFormField).at(1), 'secret1');

    await tester.ensureVisible(find.byKey(const Key('email-login-button')));

    await tester.tap(find.byKey(const Key('email-login-button')));

    await tester.pumpAndSettle();

    expect(find.byKey(const Key('login-error-summary')), findsOneWidget);

    expect(find.textContaining('internet connection'), findsOneWidget);
  });

  testWidgets('Google cancellation silently restores the form', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(
          canSkip: false,
          loginGateway: ScreenLoginGateway(
            failure: CustomerLoginFailureKind.cancelled,
          ),
          onLoginComplete: (_) {},
        ),
      ),
    );

    final googleButton = find.byKey(const Key('google-login-button'));

    expect(googleButton, findsOneWidget);

    //
    // The Google button sits below the initial 800x600 test
    // viewport, so scroll it into view before tapping.
    //
    await tester.ensureVisible(googleButton);

    await tester.pumpAndSettle();

    await tester.tap(googleButton);

    await tester.pumpAndSettle();

    expect(find.text('Google sign-in was cancelled.'), findsNothing);

    expect(find.byKey(const Key('login-error-summary')), findsNothing);
  });
}

class ScreenLoginGateway implements CustomerLoginGateway {
  ScreenLoginGateway({this.failure});

  final CustomerLoginFailureKind? failure;

  Future<CustomerLoginResult> _result() async {
    if (failure != null) {
      throw CustomerLoginException(failure!);
    }

    return const CustomerLoginResult(
      uid: 'customer-one',
      email: 'customer@feasta.test',
      emailVerified: true,
    );
  }

  @override
  Future<CustomerLoginResult> signInWithEmail({
    required String email,
    required String password,
  }) {
    return _result();
  }

  @override
  Future<CustomerLoginResult> signInWithGoogle() {
    return _result();
  }
}

class PendingScreenGateway extends ScreenLoginGateway {
  final pending = Completer<CustomerLoginResult>();
  int calls = 0;
  @override
  Future<CustomerLoginResult> _result() {
    calls++;
    return pending.future;
  }
}
