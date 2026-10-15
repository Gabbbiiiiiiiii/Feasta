import 'package:flutter/foundation.dart';

import '../domain/account_recovery.dart';
import 'email_verification_controller.dart';

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
  PasswordResetState _state = const PasswordResetState();
  PasswordResetState get state => _state;

  Future<void> submit(String email) async {
    if (_state.isSubmitting) return;
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
      // Unknown accounts intentionally receive the same success state.
      if (error.kind == AccountRecoveryFailureKind.invalidEmail) {
        _setState(const PasswordResetState(success: true));
      } else {
        _setState(
          PasswordResetState(
            error: EmailVerificationController.messageFor(error.kind),
          ),
        );
      }
    } catch (_) {
      _setState(
        const PasswordResetState(
          error: 'Password reset could not be started. Try again.',
        ),
      );
    }
  }

  void _setState(PasswordResetState value) {
    _state = value;
    notifyListeners();
  }
}
