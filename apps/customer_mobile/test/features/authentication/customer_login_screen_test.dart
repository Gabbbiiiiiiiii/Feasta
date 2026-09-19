import 'package:feasta/features/authentication/domain/customer_login.dart';
import 'package:feasta/features/presentation/screens/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
    expect(find.text('Email address *'), findsOneWidget);
    expect(find.text('Password *'), findsOneWidget);
    expect(find.byTooltip('Show password'), findsOneWidget);
    expect(find.text('Forgot password?'), findsOneWidget);
    expect(find.text('Create a customer account'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(0), 'a@b.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'secret1');
    await tester.tap(find.byKey(const Key('email-login-button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('login-error-summary')), findsOneWidget);
    expect(find.textContaining('internet connection'), findsOneWidget);
  });

  testWidgets('Google cancellation is status, not an error', (tester) async {
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
    await tester.tap(find.byKey(const Key('google-login-button')));
    await tester.pumpAndSettle();
    expect(find.text('Google sign-in was cancelled.'), findsOneWidget);
    expect(find.byKey(const Key('login-error-summary')), findsNothing);
  });
}

class ScreenLoginGateway implements CustomerLoginGateway {
  ScreenLoginGateway({this.failure});
  final CustomerLoginFailureKind? failure;

  Future<CustomerLoginResult> _result() async {
    if (failure != null) throw CustomerLoginException(failure!);
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
  }) => _result();

  @override
  Future<CustomerLoginResult> signInWithGoogle() => _result();
}
