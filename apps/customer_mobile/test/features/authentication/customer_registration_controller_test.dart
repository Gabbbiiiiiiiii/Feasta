import 'dart:async';

import 'package:feasta/features/authentication/application/customer_registration_controller.dart';
import 'package:feasta/features/authentication/domain/customer_registration.dart';
import 'package:flutter_test/flutter_test.dart';

const _testCredential = 'secret1';
const _weakCredentialMessage = 'security requirements';

void main() {
  test('only confirmed code and reason pairs are policy failures', () {
    final pairs = {
      'consent-required': CustomerRegistrationFailureKind.consentRequired,
      'policy-version-outdated': CustomerRegistrationFailureKind.policyOutdated,
      'policy-unavailable': CustomerRegistrationFailureKind.policyUnavailable,
      'invalid-policy-version':
          CustomerRegistrationFailureKind.invalidPolicyVersion,
    };
    for (final entry in pairs.entries) {
      final code = entry.key == 'invalid-policy-version'
          ? 'invalid-argument'
          : 'failed-precondition';
      expect(
        registrationPolicyFailure(code, {'reason': entry.key}),
        entry.value,
      );
      for (final wrong in [
        'permission-denied',
        'unavailable',
        code == 'invalid-argument' ? 'failed-precondition' : 'invalid-argument',
      ]) {
        expect(registrationPolicyFailure(wrong, {'reason': entry.key}), isNull);
      }
    }
    expect(
      registrationPolicyFailure('failed-precondition', {'reason': 'unknown'}),
      isNull,
    );
    expect(registrationPolicyFailure('failed-precondition', null), isNull);
  });

  for (final versions in [
    ['1.1', '1.1'],
    ['2', '3'],
    ['  future-99  ', 'future-100'],
  ]) {
    test('preserves exact versions $versions', () async {
      final gateway = FakeRegistrationGateway();
      await CustomerRegistrationController(gateway: gateway).submit(
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.test',
        password: _testCredential,
        confirmPassword: _testCredential,
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsPolicyVersion: versions[0],
        privacyPolicyVersion: versions[1],
      );
      expect(gateway.lastInput!.termsPolicyVersion, versions[0]);
      expect(gateway.lastInput!.privacyPolicyVersion, versions[1]);
    });
  }
  test('boolean consent without versions never contacts gateway', () async {
    final gateway = FakeRegistrationGateway();
    await CustomerRegistrationController(gateway: gateway).submit(
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.test',
      password: _testCredential,
      confirmPassword: _testCredential,
      acceptedTerms: true,
      acceptedPrivacy: true,
      termsPolicyVersion: '',
      privacyPolicyVersion: ' ',
    );
    expect(gateway.calls, 0);
  });
  test('disposed submission discards late result', () async {
    final gateway = FakeRegistrationGateway(block: true);
    final controller = CustomerRegistrationController(gateway: gateway);
    final pending = validSubmit(controller);
    controller.dispose();
    gateway.complete();
    expect(await pending, isNull);
  });
  for (final failure in [
    CustomerRegistrationFailureKind.consentRequired,
    CustomerRegistrationFailureKind.policyOutdated,
    CustomerRegistrationFailureKind.policyUnavailable,
    CustomerRegistrationFailureKind.invalidPolicyVersion,
  ]) {
    test('exposes policy recovery $failure without resubmission', () async {
      final gateway = FakeRegistrationGateway(failure: failure);
      final controller = CustomerRegistrationController(gateway: gateway);
      await validSubmit(controller);
      expect(controller.state.policyFailure, failure);
      expect(gateway.calls, 1);
    });
  }

  test(
    'valid registration normalizes identity and exposes no role field',
    () async {
      final gateway = FakeRegistrationGateway();
      final controller = CustomerRegistrationController(gateway: gateway);

      final result = await controller.submit(
        firstName: '  Gabby ',
        lastName: ' Customer  ',
        email: ' CUSTOMER@FEASTA.TEST ',
        password: _testCredential,
        confirmPassword: _testCredential,
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsPolicyVersion: '1.1',
        privacyPolicyVersion: '1.1',
      );

      expect(result, isNotNull);
      expect(gateway.lastInput?.firstName, 'Gabby');
      expect(gateway.lastInput?.lastName, 'Customer');
      expect(gateway.lastInput?.email, 'customer@feasta.test');
      expect(gateway.lastInput?.acceptedTerms, isTrue);
      expect(gateway.lastInput?.acceptedPrivacy, isTrue);
    },
  );

  test(
    'invalid email, weak/mismatched password, and consent fail locally',
    () async {
      final gateway = FakeRegistrationGateway();
      final controller = CustomerRegistrationController(gateway: gateway);

      await controller.submit(
        firstName: '',
        lastName: '',
        email: 'invalid',
        password: '123',
        confirmPassword: '321',
        acceptedTerms: false,
        acceptedPrivacy: false,
        termsPolicyVersion: '1.1',
        privacyPolicyVersion: '1.1',
      );

      final errors = controller.state.errors;

      expect(errors.firstName, isNotNull);
      expect(errors.lastName, isNotNull);
      expect(errors.email, isNotNull);
      expect(errors.password, isNotNull);
      expect(errors.confirmPassword, isNotNull);
      expect(errors.terms, isNotNull);
      expect(errors.privacy, isNotNull);

      expect(gateway.calls, 0);
    },
  );

  test('duplicate submit is ignored while registration is active', () async {
    final gateway = FakeRegistrationGateway(block: true);

    final controller = CustomerRegistrationController(gateway: gateway);

    final first = validSubmit(controller);

    await Future<void>.delayed(Duration.zero);

    final second = await validSubmit(controller);

    expect(second, isNull);
    expect(gateway.calls, 1);

    gateway.complete();

    expect(await first, isNotNull);
  });

  for (final entry in <CustomerRegistrationFailureKind, String>{
    CustomerRegistrationFailureKind.emailAlreadyInUse: 'account already exists',
    CustomerRegistrationFailureKind.weakPassword: _weakCredentialMessage,
    CustomerRegistrationFailureKind.invalidEmail: 'valid email',
    CustomerRegistrationFailureKind.network: 'internet connection',
    CustomerRegistrationFailureKind.tooManyRequests: 'Too many',
    CustomerRegistrationFailureKind.profileCreation: 'rolled back',
    CustomerRegistrationFailureKind.blockedAccount: 'contact Feasta support',
    CustomerRegistrationFailureKind.configuration: 'temporarily unavailable',
  }.entries) {
    test('maps ${entry.key.name} to a friendly error', () async {
      final gateway = FakeRegistrationGateway(failure: entry.key);

      final controller = CustomerRegistrationController(gateway: gateway);

      expect(await validSubmit(controller), isNull);

      expect(controller.state.generalError, contains(entry.value));
    });
  }

  test(
    'verification delivery failure preserves the completed account',
    () async {
      final gateway = FakeRegistrationGateway(verificationEmailSent: false);

      final controller = CustomerRegistrationController(gateway: gateway);

      final result = await validSubmit(controller);

      expect(result?.verificationEmailSent, isFalse);

      expect(controller.state.generalError, isNull);
    },
  );

  test(
    'existing signed-in Auth identity can report profile recovery',
    () async {
      final gateway = FakeRegistrationGateway(recoveredExistingIdentity: true);

      final result = await validSubmit(
        CustomerRegistrationController(gateway: gateway),
      );

      expect(result?.recoveredExistingIdentity, isTrue);
    },
  );
}

Future<CustomerRegistrationResult?> validSubmit(
  CustomerRegistrationController controller,
) {
  return controller.submit(
    firstName: 'Customer',
    lastName: 'One',
    email: 'customer@feasta.test',
    password: _testCredential,
    confirmPassword: _testCredential,
    acceptedTerms: true,
    acceptedPrivacy: true,
    termsPolicyVersion: '1.1',
    privacyPolicyVersion: '1.1',
  );
}

class FakeRegistrationGateway implements CustomerRegistrationGateway {
  FakeRegistrationGateway({
    this.failure,
    this.block = false,
    this.verificationEmailSent = true,
    this.recoveredExistingIdentity = false,
  });

  final CustomerRegistrationFailureKind? failure;
  final bool block;
  final bool verificationEmailSent;
  final bool recoveredExistingIdentity;

  final Completer<void> _release = Completer<void>();

  int calls = 0;

  CustomerRegistrationInput? lastInput;

  void complete() {
    if (!_release.isCompleted) {
      _release.complete();
    }
  }

  @override
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput input,
  ) async {
    calls++;
    lastInput = input;

    if (block) {
      await _release.future;
    }

    if (failure != null) {
      throw CustomerRegistrationException(failure!);
    }

    return CustomerRegistrationResult(
      email: input.email,
      verificationEmailSent: verificationEmailSent,
      recoveredExistingIdentity: recoveredExistingIdentity,
    );
  }
}
