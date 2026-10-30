import 'package:flutter/foundation.dart';

import '../domain/account_recovery.dart';

class PasswordResetState {
  const PasswordResetState({
    this.isSubmitting = false,
    this.emailError,
    this.error,
    this.success = false,
  });
  final bool isSubmitting;
  final String? emailError;
  final String? error;
  final bool success;
}

class PasswordResetController extends ChangeNotifier {
  PasswordResetController({required this.gateway});
  final PasswordResetGateway gateway;
  bool _disposed = false;
  PasswordResetState _state = const PasswordResetState();
  PasswordResetState get state => _state;

  Future<void> submit(String email) async {
    if (_disposed || _state.isSubmitting) return;
    final normalized = email.trim().toLowerCase();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(normalized)) {
      _setState(
        PasswordResetState(
          emailError: normalized.isEmpty
              ? 'Email is required.'
              : 'Enter a valid email address.',
        ),
      );
      return;
    }
    _setState(const PasswordResetState(isSubmitting: true));
    try {
      await gateway.requestPasswordReset(normalized);
      _setState(const PasswordResetState(success: true));
    } on AccountRecoveryException catch (error) {
      if (error.kind == AccountRecoveryFailureKind.invalidEmail) {
        _setState(
          const PasswordResetState(emailError: 'Enter a valid email address.'),
        );
      } else {
        _setState(PasswordResetState(error: _messageFor(error.kind)));
      }
    } catch (_) {
      _setState(
        const PasswordResetState(
          error:
              "We couldn't request a reset link. Please try again later or contact FEASTA support.",
        ),
      );
    }
  }

  static String _messageFor(AccountRecoveryFailureKind kind) => switch (kind) {
    AccountRecoveryFailureKind.network =>
      "We couldn't connect. Check your internet connection and try again.",
    AccountRecoveryFailureKind.tooManyRequests =>
      'Too many reset requests. Please wait a few minutes before trying again.',
    AccountRecoveryFailureKind.configuration =>
      'Password reset is temporarily unavailable. Please try again later or contact FEASTA support.',
    _ =>
      "We couldn't request a reset link. Please try again later or contact FEASTA support.",
  };

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _setState(PasswordResetState value) {
    if (_disposed) return;
    _state = value;
    notifyListeners();
  }
}
