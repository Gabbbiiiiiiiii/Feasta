import 'package:flutter/foundation.dart';

import '../domain/customer_registration.dart';

class CustomerRegistrationFieldErrors {
  const CustomerRegistrationFieldErrors({
    this.firstName,
    this.lastName,
    this.email,
    this.password,
    this.confirmPassword,
    this.terms,
    this.privacy,
  });

  final String? firstName;
  final String? lastName;
  final String? email;
  final String? password;
  final String? confirmPassword;
  final String? terms;
  final String? privacy;

  bool get hasErrors =>
      firstName != null ||
      lastName != null ||
      email != null ||
      password != null ||
      confirmPassword != null ||
      terms != null ||
      privacy != null;
}

class CustomerRegistrationState {
  const CustomerRegistrationState({
    this.isSubmitting = false,
    this.errors = const CustomerRegistrationFieldErrors(),
    this.generalError,
    this.result,
  });

  final bool isSubmitting;
  final CustomerRegistrationFieldErrors errors;
  final String? generalError;
  final CustomerRegistrationResult? result;
}

class CustomerRegistrationController extends ChangeNotifier {
  CustomerRegistrationController({required this.gateway});

  final CustomerRegistrationGateway gateway;

  CustomerRegistrationState _state = const CustomerRegistrationState();

  CustomerRegistrationState get state => _state;

  Future<CustomerRegistrationResult?> submit({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
    required String confirmPassword,
    required bool acceptedTerms,
    required bool acceptedPrivacy,
  }) async {
    if (_state.isSubmitting) {
      return null;
    }

    final errors = validate(
      firstName: firstName,
      lastName: lastName,
      email: email,
      password: password,
      confirmPassword: confirmPassword,
      acceptedTerms: acceptedTerms,
      acceptedPrivacy: acceptedPrivacy,
    );

    if (errors.hasErrors) {
      _setState(CustomerRegistrationState(errors: errors));

      return null;
    }

    _setState(const CustomerRegistrationState(isSubmitting: true));

    try {
      final result = await gateway.registerCustomer(
        CustomerRegistrationInput(
          firstName: firstName,
          lastName: lastName,
          email: email,
          password: password,
          acceptedTerms: acceptedTerms,
          acceptedPrivacy: acceptedPrivacy,
        ).normalized(),
      );

      _setState(CustomerRegistrationState(result: result));

      return result;
    } on CustomerRegistrationException catch (error) {
      _setState(
        CustomerRegistrationState(generalError: messageFor(error.kind)),
      );

      return null;
    } catch (_) {
      _setState(
        const CustomerRegistrationState(
          generalError:
              'We could not create your Feasta account. '
              'Please try again.',
        ),
      );

      return null;
    }
  }

  @visibleForTesting
  static CustomerRegistrationFieldErrors validate({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
    required String confirmPassword,
    required bool acceptedTerms,
    required bool acceptedPrivacy,
  }) {
    final normalizedEmail = email.trim();

    final emailValid = RegExp(
      r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
    ).hasMatch(normalizedEmail);

    return CustomerRegistrationFieldErrors(
      firstName: firstName.trim().isEmpty ? 'First name is required.' : null,
      lastName: lastName.trim().isEmpty ? 'Last name is required.' : null,
      email: normalizedEmail.isEmpty
          ? 'Email address is required.'
          : (!emailValid
                ? 'Enter a valid email address, such as name@example.com.'
                : null),
      password: password.isEmpty
          ? 'Password is required.'
          : (password.length < 6
                ? 'Password must contain at least 6 characters.'
                : null),
      confirmPassword: confirmPassword.isEmpty
          ? 'Confirm your password.'
          : (password != confirmPassword ? 'Passwords do not match.' : null),
      terms: acceptedTerms ? null : 'Accept the Terms of Service to continue.',
      privacy: acceptedPrivacy
          ? null
          : 'Accept the Privacy Policy to continue.',
    );
  }

  static String messageFor(CustomerRegistrationFailureKind kind) =>
      switch (kind) {
        CustomerRegistrationFailureKind.emailAlreadyInUse =>
          'An account already exists with this email address. '
              'Sign in instead or use a different email.',

        CustomerRegistrationFailureKind.weakPassword =>
          'Your password does not meet the account security requirements. '
              'Use at least 6 characters and try again.',

        CustomerRegistrationFailureKind.invalidEmail =>
          'Enter a valid email address, such as name@example.com.',

        CustomerRegistrationFailureKind.network =>
          'We could not connect to Feasta. '
              'Check your internet connection and try again.',

        CustomerRegistrationFailureKind.tooManyRequests =>
          'Too many account creation attempts were made. '
              'Please wait a moment before trying again.',

        CustomerRegistrationFailureKind.profileCreation =>
          'Your Feasta customer profile could not be created. '
              'The new sign-in was rolled back when possible, '
              'so you can safely try again.',

        CustomerRegistrationFailureKind.blockedAccount =>
          'This account cannot be used to create a customer profile. '
              'Please contact Feasta support for assistance.',

        CustomerRegistrationFailureKind.configuration =>
          'Account creation is temporarily unavailable. '
              'Please try again later.',

        CustomerRegistrationFailureKind.unknown =>
          'We could not create your Feasta account. '
              'Please try again.',
      };

  void _setState(CustomerRegistrationState value) {
    _state = value;
    notifyListeners();
  }
}
