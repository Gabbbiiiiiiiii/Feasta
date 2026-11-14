import 'dart:async';

import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/application/customer_auth_scope.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:feasta/features/authentication/domain/account_recovery.dart';
import 'package:feasta/features/authentication/domain/auth_account_state.dart';
import 'package:feasta/features/authentication/presentation/authentication_gate.dart';
import 'package:feasta/features/presentation/screens/email_verification_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/core/widgets/widgets.dart';

import 'customer_auth_controller_test.dart'
    show FakeCustomerAuthStateRepository, activeProfile, identity;

const unverified = CustomerAuthIdentity(
  uid: 'customer-one',
  email: 'customer@feasta.test',
  emailVerified: false,
);

class ReturnRepository extends FakeCustomerAuthStateRepository {
  final refreshFlags = <bool>[];
  Completer<CustomerAccountLoadResult>? pending;
  CustomerAuthLoadFailure? persistentFailure;
  @override
  Future<CustomerAccountLoadResult> loadAccount({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  }) {
    refreshFlags.add(forceTokenRefresh);
    final failure = persistentFailure;
    if (failure != null) return Future.error(failure);
    return pending?.future ??
        super.loadAccount(
          identity: identity,
          forceTokenRefresh: forceTokenRefresh,
        );
  }
}

class UnusedVerificationGateway implements EmailVerificationGateway {
  @override
  Future<void> logout() async => throw StateError('Unexpected logout');
  @override
  Future<bool> refreshVerification() async =>
      throw StateError('Use gate reload');
  @override
  Future<void> resendVerification() async =>
      throw StateError('Unexpected resend');
}

class ControlledVerificationGateway implements EmailVerificationGateway {
  final refresh = Completer<bool>();
  final resend = Completer<void>();
  int checks = 0;
  int sends = 0;
  @override
  Future<bool> refreshVerification() {
    checks++;
    return refresh.future;
  }

  @override
  Future<void> resendVerification() {
    sends++;
    return resend.future;
  }

  @override
  Future<void> logout() async {}
}

void main() {
  late ReturnRepository repository;
  late CustomerAuthenticationController controller;

  Future<void> mount(
    WidgetTester tester, {
    bool managed = true,
    EmailVerificationGateway? gateway,
  }) async {
    repository = ReturnRepository()
      ..result = CustomerAccountLoadResult(
        identity: unverified,
        userProfile: activeProfile(),
      );
    controller = CustomerAuthenticationController(repository: repository)
      ..start();
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerAuthenticationScope(
          controller: controller,
          child: AuthenticationGate(
            controller: controller,
            verificationBuilder: (_, _) => EmailVerificationScreen(
              email: unverified.email!,
              managedByAuthenticationGate: managed,
              verificationGateway: gateway ?? UnusedVerificationGateway(),
            ),
            customerBuilder: (_, _) => const Text('protected customer'),
            publicBuilder: (_, _) => const Text('signed out'),
          ),
        ),
      ),
    );
    repository.emitAuth(unverified);
    await tester.pumpAndSettle();
    addTearDown(() async {
      controller.dispose();
      await repository.close();
    });
  }

  Future<void> resume(WidgetTester tester) async {
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
  }

  testWidgets(
    'pending resume blocks taps and stale callbacks; unverified completion restores controls',
    (tester) async {
      final gateway = ControlledVerificationGateway();
      await mount(tester, gateway: gateway);
      final checkFinder = find.byKey(const Key('check-verification'));
      final resendFinder = find.byKey(const Key('resend-verification'));
      final staleCheck = tester
          .widget<FeastaPrimaryButton>(checkFinder)
          .onPressed!;
      final staleResend = tester
          .widget<FeastaSecondaryButton>(resendFinder)
          .onPressed!;
      repository.pending = Completer<CustomerAccountLoadResult>();
      await resume(tester);
      expect(tester.widget<FeastaPrimaryButton>(checkFinder).isLoading, isTrue);
      expect(tester.widget<FeastaPrimaryButton>(checkFinder).onPressed, isNull);
      expect(
        tester.widget<FeastaSecondaryButton>(resendFinder).onPressed,
        isNull,
      );
      await tester.tap(checkFinder);
      await tester.tap(resendFinder);
      staleCheck();
      staleResend();
      await tester.pump();
      expect(gateway.checks, 0);
      expect(gateway.sends, 0);
      repository.pending!.complete(repository.result);
      await tester.pumpAndSettle();
      expect(
        tester.widget<FeastaPrimaryButton>(checkFinder).isLoading,
        isFalse,
      );
      expect(
        tester.widget<FeastaPrimaryButton>(checkFinder).onPressed,
        isNotNull,
      );
      expect(
        tester.widget<FeastaSecondaryButton>(resendFinder).onPressed,
        isNotNull,
      );
      await tester.tap(checkFinder);
      await tester.pump();
      expect(gateway.checks, 1);
      gateway.refresh.complete(false);
      await tester.pumpAndSettle();
      await tester.tap(resendFinder);
      await tester.pump();
      expect(gateway.sends, 1);
      await tester.pumpWidget(const MaterialApp(home: Text('closed')));
      gateway.resend.complete();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  for (final resend in [false, true]) {
    testWidgets(
      'earlier manual ${resend ? 'resend' : 'check'} blocks resume and safely completes after removal',
      (tester) async {
        final gateway = ControlledVerificationGateway();
        await mount(tester, gateway: gateway);
        await tester.tap(
          find.byKey(
            Key(resend ? 'resend-verification' : 'check-verification'),
          ),
        );
        await tester.pump();
        final before = repository.refreshFlags.length;
        await resume(tester);
        expect(repository.refreshFlags.length, before);
        await tester.pumpWidget(const MaterialApp(home: Text('closed')));
        if (resend) {
          gateway.resend.complete();
        } else {
          gateway.refresh.complete(true);
        }
        await tester.pumpAndSettle();
        expect(find.text('closed'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('account switch discards old verification result', (
    tester,
  ) async {
    await mount(tester);
    final pending = Completer<CustomerAccountLoadResult>();
    repository.pending = pending;
    await resume(tester);
    const other = CustomerAuthIdentity(
      uid: 'other',
      email: 'other@feasta.test',
      emailVerified: false,
    );
    repository.pending = null;
    repository.result = CustomerAccountLoadResult(
      identity: other,
      userProfile: activeProfile(),
    );
    repository.emitAuth(other);
    await tester.pump();
    pending.complete(
      CustomerAccountLoadResult(
        identity: identity,
        userProfile: activeProfile(),
      ),
    );
    await tester.pumpAndSettle();
    expect(controller.state.email, other.email);
    expect(
      controller.state.gate.kind,
      AuthenticationGateKind.emailVerificationRequired,
    );
    expect(find.text('protected customer'), findsNothing);
  });

  testWidgets(
    'disposal during refresh prevents late navigation and removes observer',
    (tester) async {
      await mount(tester);
      repository.pending = Completer<CustomerAccountLoadResult>();
      await resume(tester);
      await tester.pumpWidget(const MaterialApp(home: Text('replacement')));
      repository.pending!.complete(
        CustomerAccountLoadResult(
          identity: identity,
          userProfile: activeProfile(),
        ),
      );
      await tester.pumpAndSettle();
      final before = repository.refreshFlags.length;
      await resume(tester);
      expect(repository.refreshFlags.length, before);
      expect(find.text('replacement'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('network failure stays protected and existing retry recovers', (
    tester,
  ) async {
    await mount(tester);
    repository.persistentFailure = const CustomerAuthLoadFailure(
      CustomerAuthLoadFailureKind.network,
    );
    await resume(tester);
    await tester.pumpAndSettle();
    expect(find.text('protected customer'), findsNothing);
    expect(find.text('You appear to be offline'), findsOneWidget);
    repository.persistentFailure = null;
    repository.result = CustomerAccountLoadResult(
      identity: identity,
      userProfile: activeProfile(),
    );
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('protected customer'), findsOneWidget);
  });

  testWidgets(
    'browser return refreshes token and unlocks only confirmed verification',
    (tester) async {
      await mount(tester);
      await resume(tester);
      expect(repository.refreshFlags.last, isTrue);
      expect(find.text('protected customer'), findsNothing);
      repository.result = CustomerAccountLoadResult(
        identity: identity,
        userProfile: activeProfile(),
      );
      await resume(tester);
      await tester.pumpAndSettle();
      expect(find.text('protected customer'), findsOneWidget);
    },
  );

  testWidgets('verification never bypasses blocked account policy', (
    tester,
  ) async {
    await mount(tester);
    repository.result = CustomerAccountLoadResult(
      identity: identity,
      userProfile: activeProfile(isBlocked: true),
    );
    await resume(tester);
    await tester.pumpAndSettle();
    expect(controller.state.gate.kind, AuthenticationGateKind.blocked);
    expect(find.text('protected customer'), findsNothing);
  });

  testWidgets(
    'duplicate resumes coalesce and sign-out discards pending result',
    (tester) async {
      await mount(tester);
      repository.pending = Completer<CustomerAccountLoadResult>();
      final before = repository.refreshFlags.length;
      await resume(tester);
      await resume(tester);
      expect(repository.refreshFlags.length, before + 1);
      repository.emitAuth(null);
      await tester.pump();
      repository.pending!.complete(
        CustomerAccountLoadResult(
          identity: identity,
          userProfile: activeProfile(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('signed out'), findsOneWidget);
      expect(find.text('protected customer'), findsNothing);
      expect(tester.takeException(), isNull);
      await resume(tester);
      expect(repository.refreshFlags.length, before + 1);
    },
  );

  testWidgets('unmanaged screen keeps explicit verification behavior', (
    tester,
  ) async {
    await mount(tester, managed: false);
    final before = repository.refreshFlags.length;
    await resume(tester);
    expect(repository.refreshFlags.length, before);
  });

  testWidgets('covered verification route does not refresh on resume', (
    tester,
  ) async {
    await mount(tester);
    final context = tester.element(find.byType(EmailVerificationScreen));
    unawaited(
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('other route')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final before = repository.refreshFlags.length;
    await resume(tester);
    expect(repository.refreshFlags.length, before);
  });
}
