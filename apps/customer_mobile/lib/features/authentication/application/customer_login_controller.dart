import 'package:flutter/foundation.dart';

import '../domain/customer_login.dart';

enum CustomerLoginMethod { email, google }

class CustomerLoginState {
  const CustomerLoginState({
    this.isSubmitting = false,
    this.submittingMethod,
    this.emailError,
    this.passwordError,
    this.generalError,
    this.notice,
  });

  final bool isSubmitting;
  final CustomerLoginMethod? submittingMethod;
  final String? emailError;
  final String? passwordError;
  final String? generalError;
  final String? notice;

  bool get isEmailSubmitting =>
      isSubmitting && submittingMethod == CustomerLoginMethod.email;

  bool get isGoogleSubmitting =>
      isSubmitting && submittingMethod == CustomerLoginMethod.google;
}

class CustomerLoginController extends ChangeNotifier {
  CustomerLoginController({required this.gateway});

  final CustomerLoginGateway gateway;

  CustomerLoginState _state = const CustomerLoginState();
  CustomerLoginState get state => _state;

  bool _disposed = false;
  bool get isDisposed => _disposed;

  @override
  void dispose() {
    if (_disposed) {
      return;
    }

    _disposed = true;
    super.dispose();
  }

  Future<CustomerLoginResult?> signInWithEmail({
    required String email,
    required String password,
  }) async {
    if (_disposed || _state.isSubmitting) {
      return null;
    }

    final normalizedEmail = email.trim().toLowerCase();
    final validEmail = RegExp(
      r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
    ).hasMatch(normalizedEmail);

    if (normalizedEmail.isEmpty || !validEmail || password.isEmpty) {
      _setState(
        CustomerLoginState(
          emailError: normalizedEmail.isEmpty
              ? 'Email is required.'
              : (!validEmail ? 'Enter a valid email address.' : null),
          passwordError: password.isEmpty ? 'Password is required.' : null,
        ),
      );
      return null;
    }

    return _run(
      method: CustomerLoginMethod.email,
      operation: () =>
          gateway.signInWithEmail(email: normalizedEmail, password: password),
    );
  }

  Future<CustomerLoginResult?> signInWithGoogle() {
    if (_disposed || _state.isSubmitting) {
      return Future<CustomerLoginResult?>.value(null);
    }

    return _run(
      method: CustomerLoginMethod.google,
      operation: gateway.signInWithGoogle,
    );
  }

  Future<CustomerLoginResult?> _run({
    required CustomerLoginMethod method,
    required Future<CustomerLoginResult> Function() operation,
  }) async {
    if (_disposed) {
      return null;
    }

    _setState(CustomerLoginState(isSubmitting: true, submittingMethod: method));

    try {
      final result = await operation();

      // Authentication can immediately rebuild the authentication gate and
      // dispose this controller before this await resumes.
      if (_disposed) {
        return result;
      }

      _setState(const CustomerLoginState());
      return result;
    } on CustomerLoginException catch (error) {
      if (_disposed) {
        return null;
      }

      if (error.kind == CustomerLoginFailureKind.cancelled) {
        _setState(
          const CustomerLoginState(notice: 'Google sign-in was cancelled.'),
        );
      } else if (error.kind == CustomerLoginFailureKind.invalidCredentials) {
        _setState(
          const CustomerLoginState(
            emailError: ' ',
            passwordError: 'Wrong email or password.',
          ),
        );
      } else {
        _setState(CustomerLoginState(generalError: messageFor(error.kind)));
      }

      return null;
    } catch (_) {
      if (_disposed) {
        return null;
      }

      _setState(
        const CustomerLoginState(
          generalError: 'Sign-in could not be completed. Please try again.',
        ),
      );
      return null;
    }
  }

  static String messageFor(CustomerLoginFailureKind kind) => switch (kind) {
    CustomerLoginFailureKind.invalidCredentials => 'Wrong email or password.',
    CustomerLoginFailureKind.invalidEmail => 'Enter a valid email address.',
    CustomerLoginFailureKind.tooManyRequests =>
      'Too many sign-in attempts. Wait a moment before trying again.',
    CustomerLoginFailureKind.network =>
      'Check your internet connection and try again.',
    CustomerLoginFailureKind.cancelled => 'Google sign-in was cancelled.',
    CustomerLoginFailureKind.blocked =>
      'This account is blocked. Contact FEASTA support.',
    CustomerLoginFailureKind.disabled => 'This account is disabled.',
    CustomerLoginFailureKind.unsupportedRole =>
      'This customer app cannot open provider or administrator accounts.',
    CustomerLoginFailureKind.missingProfile =>
      'Your customer profile could not be recovered. Contact FEASTA support.',
    CustomerLoginFailureKind.sessionExpired =>
      'Your session expired. Sign in again.',
    CustomerLoginFailureKind.configuration =>
      'Sign-in is temporarily unavailable because the app is not configured correctly.',
    CustomerLoginFailureKind.unknown =>
      'Sign-in could not be completed. Please try again.',
  };

  void _setState(CustomerLoginState value) {
    if (_disposed) {
      return;
    }

    _state = value;
    notifyListeners();
  }
}
