import 'dart:async';

import 'package:feasta/features/authentication/application/customer_login_controller.dart';
import 'package:feasta/features/authentication/domain/customer_login.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('correct email login is normalized without changing password', () async {
    final gateway = FakeLoginGateway();
    final result = await CustomerLoginController(
      gateway: gateway,
    ).signInWithEmail(email: ' CUSTOMER@FEASTA.TEST ', password: ' secret ');
    expect(result?.uid, 'customer-one');
    expect(gateway.email, 'customer@feasta.test');
    expect(gateway.password, ' secret ');
  });

  test('invalid email and empty password fail locally', () async {
    final gateway = FakeLoginGateway();
    final controller = CustomerLoginController(gateway: gateway);
    expect(
      await controller.signInWithEmail(email: 'bad', password: ''),
      isNull,
    );
    expect(controller.state.emailError, isNotNull);
    expect(controller.state.passwordError, isNotNull);
    expect(gateway.calls, 0);
  });

  test('repeated login tap is prevented', () async {
    final gateway = FakeLoginGateway(block: true);
    final controller = CustomerLoginController(gateway: gateway);
    final first = controller.signInWithEmail(
      email: 'customer@feasta.test',
      password: 'secret1',
    );
    await Future<void>.delayed(Duration.zero);
    final second = await controller.signInWithGoogle();
    expect(second, isNull);
    expect(gateway.calls, 1);
    gateway.release();
    expect(await first, isNotNull);
  });

  test('Google success and cancellation are distinct outcomes', () async {
    final success = CustomerLoginController(gateway: FakeLoginGateway());
    expect((await success.signInWithGoogle())?.uid, 'customer-one');

    final cancelled = CustomerLoginController(
      gateway: FakeLoginGateway(failure: CustomerLoginFailureKind.cancelled),
    );
    expect(await cancelled.signInWithGoogle(), isNull);
    expect(cancelled.state.generalError, isNull);
    expect(cancelled.state.notice, contains('cancelled'));
  });

  for (final entry in <CustomerLoginFailureKind, String>{
    CustomerLoginFailureKind.invalidCredentials: 'Wrong email or password',
    CustomerLoginFailureKind.tooManyRequests: 'Too many',
    CustomerLoginFailureKind.network: 'internet connection',
    CustomerLoginFailureKind.blocked: 'blocked',
    CustomerLoginFailureKind.disabled: 'disabled',
    CustomerLoginFailureKind.unsupportedRole: 'provider or administrator',
    CustomerLoginFailureKind.missingProfile: 'could not be recovered',
    CustomerLoginFailureKind.sessionExpired: 'session expired',
  }.entries) {
    test('maps ${entry.key.name} safely', () async {
      final controller = CustomerLoginController(
        gateway: FakeLoginGateway(failure: entry.key),
      );
      expect(
        await controller.signInWithEmail(
          email: 'customer@feasta.test',
          password: 'secret1',
        ),
        isNull,
      );
      final message =
          controller.state.passwordError ?? controller.state.generalError ?? '';
      expect(message, contains(entry.value));
    });
  }

  test('Google missing profile recovery returns a valid customer', () async {
    final gateway = FakeLoginGateway(recoveredMissingProfile: true);
    final result = await CustomerLoginController(
      gateway: gateway,
    ).signInWithGoogle();
    expect(result, isNotNull);
    expect(gateway.recoveredMissingProfile, isTrue);
  });
}

class FakeLoginGateway implements CustomerLoginGateway {
  FakeLoginGateway({
    this.failure,
    this.block = false,
    this.recoveredMissingProfile = false,
  });

  final CustomerLoginFailureKind? failure;
  final bool block;
  final bool recoveredMissingProfile;
  final _completer = Completer<void>();
  int calls = 0;
  String? email;
  String? password;

  void release() => _completer.complete();

  Future<CustomerLoginResult> _result() async {
    calls++;
    if (block) await _completer.future;
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
  }) {
    this.email = email;
    this.password = password;
    return _result();
  }

  @override
  Future<CustomerLoginResult> signInWithGoogle() => _result();
}
