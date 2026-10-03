import 'dart:async';

import 'package:flutter/foundation.dart';

import '../domain/account_recovery.dart';

class EmailVerificationState {
  const EmailVerificationState({
    this.isResending = false,
    this.isRefreshing = false,
    this.cooldownSeconds = 0,
    this.error,
    this.notice,
  });
  final bool isResending;
  final bool isRefreshing;
  final int cooldownSeconds;
  final String? error;
  final String? notice;
}

class EmailVerificationController extends ChangeNotifier {
  EmailVerificationController({
    required this.gateway,
    this.resendCooldown = const Duration(seconds: 60),
  });

  final EmailVerificationGateway gateway;
  final Duration resendCooldown;
  EmailVerificationState _state = const EmailVerificationState();
  EmailVerificationState get state => _state;
  Timer? _cooldownTimer;
  DateTime? _cooldownEndsAt;

  Future<void> resend() async {
    if (_state.isResending ||
        _state.isRefreshing ||
        _state.cooldownSeconds > 0) {
      return;
    }
    _setState(const EmailVerificationState(isResending: true));
    try {
      await gateway.resendVerification();
      _startCooldown();
      _setState(
        EmailVerificationState(
          cooldownSeconds: _remainingSeconds(),
          notice: 'A new verification email was sent.',
        ),
      );
    } on AccountRecoveryException catch (error) {
      _setState(EmailVerificationState(error: messageFor(error.kind)));
    } catch (_) {
      _setState(
        const EmailVerificationState(
          error: 'Unable to resend verification right now. Try again later.',
        ),
      );
    }
  }

  Future<bool> refresh() async {
    if (_state.isRefreshing || _state.isResending) return false;
    _setState(
      EmailVerificationState(
        isRefreshing: true,
        cooldownSeconds: _state.cooldownSeconds,
      ),
    );
    try {
      final verified = await gateway.refreshVerification();
      _setState(
        EmailVerificationState(
          cooldownSeconds: _remainingSeconds(),
          notice: verified
              ? 'Email verified. Finishing sign-in…'
              : 'Not verified yet. Open the newest email and try again.',
        ),
      );
      return verified;
    } on AccountRecoveryException catch (error) {
      _setState(EmailVerificationState(error: messageFor(error.kind)));
      return false;
    } catch (_) {
      _setState(
        const EmailVerificationState(
          error: 'Unable to check verification right now. Try again.',
        ),
      );
      return false;
    }
  }

  static String messageFor(AccountRecoveryFailureKind kind) => switch (kind) {
    AccountRecoveryFailureKind.tooManyRequests =>
      'Too many requests. Wait before trying again.',
    AccountRecoveryFailureKind.sessionExpired =>
      'Your session expired. Change account and sign in again.',
    AccountRecoveryFailureKind.disabled => 'This account is disabled.',
    AccountRecoveryFailureKind.network =>
      'Check your internet connection and try again.',
    AccountRecoveryFailureKind.invalidEmail => 'Enter a valid email address.',
    AccountRecoveryFailureKind.invalidActionCode =>
      'This action link is invalid or was already used.',
    AccountRecoveryFailureKind.expiredActionCode =>
      'This action link has expired. Request a new one.',
    AccountRecoveryFailureKind.configuration =>
      'Account recovery is temporarily unavailable.',
    AccountRecoveryFailureKind.unknown =>
      'The request could not be completed. Try again.',
  };

  void _startCooldown() {
    _cooldownEndsAt = DateTime.now().add(resendCooldown);
    _cooldownTimer?.cancel();
    final interval = resendCooldown < const Duration(seconds: 1)
        ? resendCooldown
        : const Duration(seconds: 1);
    _cooldownTimer = Timer.periodic(interval, (_) {
      final remaining = _remainingSeconds();
      _setState(EmailVerificationState(cooldownSeconds: remaining));
      if (remaining == 0) _cooldownTimer?.cancel();
    });
  }

  int _remainingSeconds() {
    final milliseconds =
        _cooldownEndsAt?.difference(DateTime.now()).inMilliseconds ?? 0;
    if (milliseconds <= 0) return 0;
    return (milliseconds / 1000).ceil();
  }

  void _setState(EmailVerificationState value) {
    _state = value;
    notifyListeners();
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }
}
