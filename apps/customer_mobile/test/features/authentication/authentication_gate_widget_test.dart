import 'dart:async';

import 'package:feasta/app/router/customer_route_guard.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/application/customer_auth_scope.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:feasta/features/authentication/domain/auth_account_state.dart';
import 'package:feasta/features/authentication/presentation/authentication_gate.dart';
import 'package:feasta/features/splash/splash_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const widgetIdentity = CustomerAuthIdentity(
  uid: 'widget-customer',
  email: 'widget@feasta.test',
  emailVerified: true,
);

void main() {
  testWidgets('shows startup loading before authentication resolves', (
    tester,
  ) async {
    final harness = GateHarness();
    await tester.pumpWidget(harness.widget());

    expect(find.byType(SplashScreen), findsOneWidget);
    expect(find.text('Feasta'), findsOneWidget);
    await harness.dispose();
  });

  testWidgets('shows public browsing for an unauthenticated public route', (
    tester,
  ) async {
    final harness = GateHarness();
    await tester.pumpWidget(harness.widget());
    harness.repository.emitAuth(null);
    await tester.pump();

    expect(find.text('public browsing'), findsOneWidget);
    await harness.dispose();
  });

  testWidgets('protects account route and restores it after login', (
    tester,
  ) async {
    final harness = GateHarness(initialLocation: CustomerAppLocations.account);
    await tester.pumpWidget(harness.widget());
    harness.repository.emitAuth(null);
    await tester.pump();
    expect(find.text('secure login'), findsOneWidget);

    harness.repository.emitAuth(widgetIdentity);
    await tester.pumpAndSettle();
    expect(find.text('customer destination: /account'), findsOneWidget);
    await harness.dispose();
  });

  testWidgets('transient profile failure displays retry and recovers', (
    tester,
  ) async {
    final harness = GateHarness();
    harness.repository.nextFailure = const CustomerAuthLoadFailure(
      CustomerAuthLoadFailureKind.network,
    );
    await tester.pumpWidget(harness.widget());
    harness.repository.emitAuth(widgetIdentity);
    await tester.pumpAndSettle();

    expect(find.text('You appear to be offline'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.textContaining('customer destination:'), findsOneWidget);
    await harness.dispose();
  });

  testWidgets('session expiry displays a safe sign-in state', (tester) async {
    final harness = GateHarness();
    harness.repository.nextFailure = const CustomerAuthLoadFailure(
      CustomerAuthLoadFailureKind.sessionExpired,
    );
    await tester.pumpWidget(harness.widget());
    harness.repository.emitAuth(widgetIdentity);
    await tester.pumpAndSettle();

    expect(find.text('Your session has expired'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    await harness.dispose();
  });
}

class GateHarness {
  GateHarness({String initialLocation = CustomerAppLocations.browse}) {
    repository = WidgetFakeRepository();
    controller = CustomerAuthenticationController(
      repository: repository,
      initialLocation: initialLocation,
    )..start();
  }

  late final WidgetFakeRepository repository;
  late final CustomerAuthenticationController controller;

  Widget widget() {
    return MaterialApp(
      home: CustomerAuthenticationScope(
        controller: controller,
        child: AuthenticationGate(
          controller: controller,
          publicBuilder: (_, _) =>
              const Scaffold(body: Text('public browsing')),
          loginBuilder: (_, _) => const Scaffold(body: Text('secure login')),
          verificationBuilder: (_, _) =>
              const Scaffold(body: Text('verify email')),
          customerBuilder: (_, value) => Scaffold(
            body: Text(
              'customer destination: ${value.consumeIntendedLocation()}',
            ),
          ),
        ),
      ),
    );
  }

  Future<void> dispose() async {
    controller.dispose();
    await repository.close();
  }
}

class WidgetFakeRepository implements CustomerAuthStateRepository {
  WidgetFakeRepository();

  final _auth = StreamController<CustomerAuthIdentity?>.broadcast();
  final _token = StreamController<CustomerAuthIdentity?>.broadcast();
  final _account = StreamController<void>.broadcast();
  CustomerAuthIdentity? _identity;
  CustomerAuthLoadFailure? nextFailure;

  @override
  Stream<CustomerAuthIdentity?> authStateChanges() => _auth.stream;

  @override
  Stream<CustomerAuthIdentity?> idTokenChanges() => _token.stream;

  @override
  Stream<void> accountChanges(String uid) => _account.stream;

  @override
  CustomerAuthIdentity? get currentIdentity => _identity;

  void emitAuth(CustomerAuthIdentity? value) {
    _identity = value;
    _auth.add(value);
  }

  @override
  Future<CustomerAccountLoadResult> loadAccount({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  }) async {
    final failure = nextFailure;
    nextFailure = null;
    if (failure != null) throw failure;
    return const CustomerAccountLoadResult(
      identity: widgetIdentity,
      userProfile: AuthenticationUserProfileInput(
        role: 'customer',
        accountStatus: 'active',
        isActive: true,
        isBlocked: false,
        isPhoneVerified: true,
      ),
    );
  }

  @override
  Future<void> signOut() async => emitAuth(null);

  Future<void> close() async {
    await _auth.close();
    await _token.close();
    await _account.close();
  }
}
