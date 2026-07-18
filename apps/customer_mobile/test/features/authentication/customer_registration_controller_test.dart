import 'dart:async';

import 'package:feasta/features/authentication/application/customer_registration_controller.dart';
import 'package:feasta/features/authentication/domain/customer_registration.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'valid registration normalizes identity and exposes no role field',
    () async {
      final gateway = FakeRegistrationGateway();
      final controller = CustomerRegistrationController(gateway: gateway);

      final result = await controller.submit(
        firstName: '  Gabby ',
        lastName: ' Customer  ',
        email: ' CUSTOMER@FEASTA.TEST ',
        password: 'secret1',
        confirmPassword: 'secret1',
        acceptedTerms: true,
        acceptedPrivacy: true,
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
    CustomerRegistrationFailureKind.emailAlreadyInUse: 'already registered',
    CustomerRegistrationFailureKind.weakPassword: 'security requirements',
    CustomerRegistrationFailureKind.invalidEmail: 'valid email',
    CustomerRegistrationFailureKind.network: 'internet connection',
    CustomerRegistrationFailureKind.tooManyRequests: 'Too many',
    CustomerRegistrationFailureKind.profileCreation: 'rolled back',
    CustomerRegistrationFailureKind.blockedAccount: 'Contact FEASTA support',
    CustomerRegistrationFailureKind.configuration: 'not configured',
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
) => controller.submit(
  firstName: 'Customer',
  lastName: 'One',
  email: 'customer@feasta.test',
  password: 'secret1',
  confirmPassword: 'secret1',
  acceptedTerms: true,
  acceptedPrivacy: true,
);

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
    if (!_release.isCompleted) _release.complete();
  }

  @override
  Future<CustomerRegistrationResult> registerCustomer(
    CustomerRegistrationInput input,
  ) async {
    calls++;
    lastInput = input;
    if (block) await _release.future;
    if (failure != null) throw CustomerRegistrationException(failure!);
    return CustomerRegistrationResult(
      email: input.email,
      verificationEmailSent: verificationEmailSent,
      recoveredExistingIdentity: recoveredExistingIdentity,
    );
  }
}
