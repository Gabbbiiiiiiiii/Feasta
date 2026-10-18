import 'dart:async';

import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:feasta/features/authentication/domain/auth_account_state.dart';
import 'package:flutter_test/flutter_test.dart';

const identity = CustomerAuthIdentity(
  uid: 'customer-one',
  email: 'customer@feasta.test',
  emailVerified: true,
);

AuthenticationUserProfileInput activeProfile({
  Object? role = 'customer',
  Object? accountStatus = 'active',
  Object? isActive = true,
  Object? isBlocked = false,
  Object? isPhoneVerified = true,
}) {
  return AuthenticationUserProfileInput(
    role: role,
    accountStatus: accountStatus,
    isActive: isActive,
    isBlocked: isBlocked,
    isPhoneVerified: isPhoneVerified,
  );
}

Future<void> settleController() async {
  await Future<void>.delayed(const Duration(milliseconds: 20));
}

void main() {
  for (final tokenFirst in [false, true]) {
    test(
      'initial auth/token replay shares one authorization, tokenFirst=$tokenFirst',
      () async {
        final repository = FakeCustomerAuthStateRepository(
          loadDelay: const Duration(milliseconds: 20),
        );
        final controller = CustomerAuthenticationController(
          repository: repository,
        )..start();
        if (tokenFirst) {
          repository.emitToken(identity);
          repository.emitAuth(identity);
        } else {
          repository.emitAuth(identity);
          repository.emitToken(identity);
        }
        await Future<void>.delayed(const Duration(milliseconds: 50));
        expect(repository.loadCount, 1);
        expect(
          controller.state.gate.kind,
          AuthenticationGateKind.customerReady,
        );
        repository.emitToken(identity);
        await Future<void>.delayed(const Duration(milliseconds: 50));
        expect(repository.loadCount, 2);
        repository.emitAccountChange();
        await Future<void>.delayed(const Duration(milliseconds: 50));
        expect(repository.loadCount, 3);
        controller.dispose();
        await repository.close();
      },
    );
  }

  test('persistent server failure stops after two recovery attempts', () async {
    final repository = AlwaysFailingRepository();
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    repository.emitAuth(identity);
    await Future<void>.delayed(const Duration(milliseconds: 1400));
    expect(repository.attempts, 3);
    expect(controller.loadingAccount, false);
    expect(controller.state.failure, CustomerAuthenticationFailureKind.server);
    expect(repository.listenerCount, 0);
    controller.dispose();
    await repository.close();
  });

  test(
    'callable setup failure is retryable and never starts listeners',
    () async {
      final repository = FakeCustomerAuthStateRepository();
      repository.nextFailure = const CustomerAuthLoadFailure(
        CustomerAuthLoadFailureKind.callableAccess,
      );
      final controller = CustomerAuthenticationController(
        repository: repository,
      )..start();
      repository.emitAuth(identity);
      await settleController();
      expect(
        controller.state.failure,
        CustomerAuthenticationFailureKind.callableAccess,
      );
      expect(repository.listenerCount, 0);
      expect(repository.signOutCount, 0);
      await controller.refresh();
      expect(controller.state.gate.kind, AuthenticationGateKind.customerReady);
      controller.dispose();
      await repository.close();
    },
  );
  test(
    'switching accounts discards old results and binds only the new identity',
    () async {
      final repository = FakeCustomerAuthStateRepository(
        loadDelay: const Duration(milliseconds: 40),
      );
      final controller = CustomerAuthenticationController(
        repository: repository,
      )..start();
      repository.emitAuth(identity);
      await Future<void>.delayed(const Duration(milliseconds: 5));
      const second = CustomerAuthIdentity(
        uid: 'customer-two',
        email: null,
        emailVerified: true,
      );
      repository.emitAuth(second);
      repository.result = CustomerAccountLoadResult(
        identity: second,
        userProfile: activeProfile(),
      );
      await Future<void>.delayed(const Duration(milliseconds: 100));
      expect(repository.listenerCount, 1);
      expect(controller.state.email, isNull);
      expect(controller.state.gate.kind, AuthenticationGateKind.customerReady);
      controller.dispose();
      await repository.close();
    },
  );

  test('duplicates during bootstrap do not start listeners early', () async {
    final repository = FakeCustomerAuthStateRepository(
      loadDelay: const Duration(milliseconds: 40),
    );
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    repository.emitAuth(identity);
    repository.emitToken(identity);
    await Future<void>.delayed(const Duration(milliseconds: 5));
    expect(repository.listenerCount, 0);
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(repository.listenerCount, 1);
    expect(repository.maximumConcurrentLoads, 1);
    controller.dispose();
    await repository.close();
  });

  test('sign-out during bootstrap discards stale completion', () async {
    final repository = FakeCustomerAuthStateRepository(
      loadDelay: const Duration(milliseconds: 40),
    );
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    repository.emitAuth(identity);
    await Future<void>.delayed(const Duration(milliseconds: 5));
    await controller.signOut();
    await Future<void>.delayed(const Duration(milliseconds: 60));
    expect(controller.state.gate.kind, AuthenticationGateKind.unauthenticated);
    expect(repository.listenerCount, 0);
    controller.dispose();
    await repository.close();
  });

  test('consent-required holds duplicate events without listeners', () async {
    final repository = FakeCustomerAuthStateRepository();
    repository.nextFailure = const CustomerAuthLoadFailure(
      CustomerAuthLoadFailureKind.consentRequired,
    );
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    repository.emitAuth(identity);
    repository.emitToken(identity);
    await settleController();
    expect(controller.consentRequired, true);
    expect(repository.loadCount, 1);
    expect(repository.listenerCount, 0);
    await controller.signOut();
    expect(controller.consentRequired, false);
    controller.dispose();
    await repository.close();
  });

  test('permission failure is retryable without terminating auth', () async {
    final repository = FakeCustomerAuthStateRepository();
    repository.nextFailure = const CustomerAuthLoadFailure(
      CustomerAuthLoadFailureKind.accountAccess,
    );
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    repository.emitAuth(identity);
    await settleController();
    expect(
      controller.state.failure,
      CustomerAuthenticationFailureKind.accountAccess,
    );
    expect(repository.signOutCount, 0);
    expect(repository.listenerCount, 0);
    await controller.refresh();
    expect(controller.state.gate.kind, AuthenticationGateKind.customerReady);
    controller.dispose();
    await repository.close();
  });

  test('starts in loading and resolves unauthenticated state', () async {
    final repository = FakeCustomerAuthStateRepository();
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    expect(controller.state.gate.kind, AuthenticationGateKind.loading);

    repository.emitAuth(null);
    await settleController();
    expect(controller.state.gate.kind, AuthenticationGateKind.unauthenticated);
    await repository.close();
    controller.dispose();
  });

  test('resolves verified, unverified, and phone-required customers', () async {
    final repository = FakeCustomerAuthStateRepository();
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();

    repository.emitAuth(identity);
    await settleController();
    expect(controller.state.gate.kind, AuthenticationGateKind.customerReady);

    repository.result = CustomerAccountLoadResult(
      identity: const CustomerAuthIdentity(
        uid: 'customer-one',
        email: 'customer@feasta.test',
        emailVerified: false,
      ),
      userProfile: activeProfile(),
    );
    await controller.refresh();
    expect(
      controller.state.gate.kind,
      AuthenticationGateKind.emailVerificationRequired,
    );

    repository.result = CustomerAccountLoadResult(
      identity: identity,
      userProfile: activeProfile(isPhoneVerified: false),
    );
    await controller.refresh();
    expect(
      controller.state.gate.kind,
      AuthenticationGateKind.customerPhoneVerificationRequired,
    );
    await repository.close();
    controller.dispose();
  });

  test('fails closed for blocked, deactivated, and missing profiles', () async {
    final repository = FakeCustomerAuthStateRepository();
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    repository.emitAuth(identity);
    await settleController();

    for (final entry in <CustomerAccountLoadResult, AuthenticationGateKind>{
      CustomerAccountLoadResult(
        identity: identity,
        userProfile: activeProfile(isBlocked: true),
      ): AuthenticationGateKind.blocked,
      CustomerAccountLoadResult(
        identity: identity,
        userProfile: activeProfile(accountStatus: 'pending_deletion'),
      ): AuthenticationGateKind.deactivated,
      const CustomerAccountLoadResult(identity: identity, userProfile: null):
          AuthenticationGateKind.missingUserProfile,
    }.entries) {
      repository.result = entry.key;
      repository.emitAuth(identity);
      await settleController();
      expect(controller.state.gate.kind, entry.value);
    }
    await repository.close();
    controller.dispose();
  });

  test('provider and admin roles are forbidden in customer mobile', () async {
    final repository = FakeCustomerAuthStateRepository();
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    repository.emitAuth(identity);
    await settleController();

    for (final role in ['provider', 'admin']) {
      repository.result = CustomerAccountLoadResult(
        identity: identity,
        userProfile: activeProfile(role: role),
      );
      repository.emitAuth(identity);
      await settleController();
      expect(controller.state.gate.kind, AuthenticationGateKind.forbiddenRole);
    }
    await repository.close();
    controller.dispose();
  });

  test('session expiry and disabled Auth accounts have typed states', () async {
    final repository = FakeCustomerAuthStateRepository();
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    repository.emitAuth(identity);
    await settleController();

    repository.nextFailure = const CustomerAuthLoadFailure(
      CustomerAuthLoadFailureKind.sessionExpired,
    );
    await controller.refresh();
    expect(controller.state.gate.kind, AuthenticationGateKind.sessionExpired);
    expect(repository.signOutCount, 1);

    repository.emitAuth(identity);
    await settleController();
    repository.nextFailure = const CustomerAuthLoadFailure(
      CustomerAuthLoadFailureKind.disabledAuthAccount,
    );
    await controller.refresh();
    expect(
      controller.state.gate.kind,
      AuthenticationGateKind.disabledAuthAccount,
    );
    await repository.close();
    controller.dispose();
  });

  test('token and account events reload serially without overlap', () async {
    final repository = FakeCustomerAuthStateRepository(
      loadDelay: const Duration(milliseconds: 8),
    );
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();

    repository.emitAuth(identity);
    repository.emitToken(identity); // Initial matching replay joins the load.
    repository.emitToken(identity); // A later event must queue fresh checks.
    repository.emitAccountChange();
    await settleController();
    await settleController();

    expect(repository.loadCount, greaterThanOrEqualTo(2));
    expect(repository.maximumConcurrentLoads, 1);
    expect(controller.state.gate.kind, AuthenticationGateKind.customerReady);
    await repository.close();
    controller.dispose();
  });

  test(
    'transient Firestore failure recovers with bounded automatic retry',
    () async {
      final repository = FakeCustomerAuthStateRepository();
      final controller = CustomerAuthenticationController(
        repository: repository,
      )..start();
      repository.nextFailure = const CustomerAuthLoadFailure(
        CustomerAuthLoadFailureKind.network,
      );
      repository.emitAuth(identity);
      await settleController();
      expect(controller.state.failure, isNull);
      expect(controller.loadingAccount, isTrue);
      await Future<void>.delayed(const Duration(milliseconds: 450));
      expect(repository.loadCount, 2);
      expect(controller.state.failure, isNull);
      expect(controller.state.gate.kind, AuthenticationGateKind.customerReady);
      await repository.close();
      controller.dispose();
    },
  );

  test(
    'logout clears protected destination and cached account context',
    () async {
      final repository = FakeCustomerAuthStateRepository();
      final controller = CustomerAuthenticationController(
        repository: repository,
        initialLocation: '/bookings',
      )..start();
      repository.emitAuth(identity);
      await settleController();

      await controller.signOut();
      expect(
        controller.state.gate.kind,
        AuthenticationGateKind.unauthenticated,
      );
      expect(controller.intendedLocation, '/browse');
      expect(repository.currentIdentity, isNull);
      expect(repository.signOutCount, greaterThanOrEqualTo(1));
      await repository.close();
      controller.dispose();
    },
  );

  test(
    'blocked account terminates the active session but preserves message',
    () async {
      final repository = FakeCustomerAuthStateRepository();
      repository.result = CustomerAccountLoadResult(
        identity: identity,
        userProfile: activeProfile(isBlocked: true),
      );
      final controller = CustomerAuthenticationController(
        repository: repository,
      )..start();
      repository.emitAuth(identity);
      await settleController();

      expect(controller.state.gate.kind, AuthenticationGateKind.blocked);
      expect(repository.signOutCount, 1);
      expect(repository.currentIdentity, isNull);
      await repository.close();
      controller.dispose();
    },
  );
}

class FakeCustomerAuthStateRepository implements CustomerAuthStateRepository {
  FakeCustomerAuthStateRepository({this.loadDelay = Duration.zero});

  final Duration loadDelay;
  final _auth = StreamController<CustomerAuthIdentity?>.broadcast();
  final _token = StreamController<CustomerAuthIdentity?>.broadcast();
  final _account = StreamController<void>.broadcast();

  CustomerAuthIdentity? _currentIdentity;
  CustomerAccountLoadResult result = CustomerAccountLoadResult(
    identity: identity,
    userProfile: activeProfile(),
  );
  CustomerAuthLoadFailure? nextFailure;
  int loadCount = 0;
  int _concurrentLoads = 0;
  int maximumConcurrentLoads = 0;
  int signOutCount = 0;
  int listenerCount = 0;

  @override
  Stream<CustomerAuthIdentity?> authStateChanges() => _auth.stream;

  @override
  Stream<CustomerAuthIdentity?> idTokenChanges() => _token.stream;

  @override
  Stream<void> accountChanges(String uid) {
    listenerCount++;
    return _account.stream;
  }

  @override
  CustomerAuthIdentity? get currentIdentity => _currentIdentity;

  void emitAuth(CustomerAuthIdentity? value) {
    _currentIdentity = value;
    _auth.add(value);
  }

  void emitToken(CustomerAuthIdentity? value) {
    _currentIdentity = value;
    _token.add(value);
  }

  void emitAccountChange() => _account.add(null);

  @override
  Future<CustomerAccountLoadResult> loadAccount({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  }) async {
    loadCount++;
    _concurrentLoads++;
    maximumConcurrentLoads = maximumConcurrentLoads < _concurrentLoads
        ? _concurrentLoads
        : maximumConcurrentLoads;
    try {
      if (loadDelay > Duration.zero) await Future<void>.delayed(loadDelay);
      final failure = nextFailure;
      nextFailure = null;
      if (failure != null) throw failure;
      return result;
    } finally {
      _concurrentLoads--;
    }
  }

  @override
  Future<void> signOut() async {
    signOutCount++;
    emitAuth(null);
  }

  Future<void> close() async {
    await _auth.close();
    await _token.close();
    await _account.close();
  }
}

class AlwaysFailingRepository extends FakeCustomerAuthStateRepository {
  int attempts = 0;
  @override
  Future<CustomerAccountLoadResult> loadAccount({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  }) async {
    attempts++;
    throw const CustomerAuthLoadFailure(CustomerAuthLoadFailureKind.server);
  }
}
