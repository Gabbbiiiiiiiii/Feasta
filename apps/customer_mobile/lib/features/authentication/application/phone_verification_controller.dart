import 'dart:async';

import 'package:flutter/foundation.dart';

import '../domain/phone_verification.dart';

class PhoneVerificationState {
  const PhoneVerificationState({
    this.normalizedPhone,
    this.verificationId,
    this.resendToken,
    this.isSending = false,
    this.isConfirming = false,
    this.isVerified = false,
    this.cooldownSeconds = 0,
    this.phoneError,
    this.codeError,
    this.error,
    this.notice,
  });

  final String? normalizedPhone;
  final String? verificationId;
  final int? resendToken;
  final bool isSending;
  final bool isConfirming;
  final bool isVerified;
  final int cooldownSeconds;
  final String? phoneError;
  final String? codeError;
  final String? error;
  final String? notice;

  PhoneVerificationState copyWith({
    String? normalizedPhone,
    String? verificationId,
    int? resendToken,
    bool? isSending,
    bool? isConfirming,
    bool? isVerified,
    int? cooldownSeconds,
    String? phoneError,
    String? codeError,
    String? error,
    String? notice,
    bool clearErrors = false,
  }) => PhoneVerificationState(
    normalizedPhone: normalizedPhone ?? this.normalizedPhone,
    verificationId: verificationId ?? this.verificationId,
    resendToken: resendToken ?? this.resendToken,
    isSending: isSending ?? this.isSending,
    isConfirming: isConfirming ?? this.isConfirming,
    isVerified: isVerified ?? this.isVerified,
    cooldownSeconds: cooldownSeconds ?? this.cooldownSeconds,
    phoneError: phoneError ?? (clearErrors ? null : this.phoneError),
    codeError: codeError ?? (clearErrors ? null : this.codeError),
    error: error ?? (clearErrors ? null : this.error),
    notice: notice ?? this.notice,
  );
}

class PhoneVerificationController extends ChangeNotifier {
  PhoneVerificationController({
    required this.gateway,
    this.resendCooldown = const Duration(seconds: 60),
  });

  final PhoneVerificationGateway gateway;
  final Duration resendCooldown;
  PhoneVerificationState state = const PhoneVerificationState();
  Timer? _timer;

  Future<void> sendCode(String rawPhone, {bool resend = false}) async {
    if (state.isSending ||
        state.isConfirming ||
        (resend && state.cooldownSeconds > 0)) {
      return;
    }
    final phone = normalizePhilippineMobile(rawPhone);
    if (phone == null) {
      state = state.copyWith(
        phoneError: 'Enter a valid Philippine mobile number.',
        clearErrors: true,
      );
      notifyListeners();
      return;
    }
    state = state.copyWith(
      normalizedPhone: phone,
      isSending: true,
      clearErrors: true,
    );
    notifyListeners();
    try {
      await gateway.requestCode(
        phoneNumber: phone,
        resendToken: resend ? state.resendToken : null,
        onCodeSent: (verificationId, resendToken) {
          state = state.copyWith(
            verificationId: verificationId,
            resendToken: resendToken,
            isSending: false,
            notice:
                'We sent a verification code to ${maskPhilippineMobile(phone)}.',
            clearErrors: true,
          );
          _startCooldown();
          notifyListeners();
        },
        onVerified: () async {
          state = state.copyWith(
            isSending: false,
            isVerified: true,
            clearErrors: true,
          );
          notifyListeners();
        },
        onFailure: _handleFailure,
        onTimeout: (verificationId) {
          state = state.copyWith(
            verificationId: verificationId,
            isSending: false,
          );
          notifyListeners();
        },
      );
    } on PhoneVerificationException catch (error) {
      _handleFailure(error);
    }
  }

  Future<bool> confirmCode(String code) async {
    if (state.isSending || state.isConfirming) return false;
    if (state.verificationId == null) {
      state = state.copyWith(
        codeError: 'Request a verification code first.',
        clearErrors: true,
      );
      notifyListeners();
      return false;
    }
    if (!RegExp(r'^\d{6}$').hasMatch(code.trim())) {
      state = state.copyWith(
        codeError: 'Enter the 6-digit verification code.',
        clearErrors: true,
      );
      notifyListeners();
      return false;
    }
    state = state.copyWith(isConfirming: true, clearErrors: true);
    notifyListeners();
    try {
      await gateway.confirmCode(
        verificationId: state.verificationId!,
        smsCode: code.trim(),
      );
      state = state.copyWith(
        isConfirming: false,
        isVerified: true,
        clearErrors: true,
      );
      notifyListeners();
      return true;
    } on PhoneVerificationException catch (error) {
      _handleFailure(error);
      return false;
    }
  }

  void _handleFailure(PhoneVerificationException exception) {
    final codeError = switch (exception.kind) {
      PhoneVerificationFailureKind.invalidCode =>
        'The verification code is incorrect.',
      PhoneVerificationFailureKind.expiredCode =>
        'The code expired. Request a new code.',
      _ => null,
    };
    state = state.copyWith(
      isSending: false,
      isConfirming: false,
      codeError: codeError,
      error: codeError == null ? messageFor(exception.kind) : null,
      clearErrors: true,
    );
    notifyListeners();
  }

  static String messageFor(PhoneVerificationFailureKind kind) => switch (kind) {
    PhoneVerificationFailureKind.invalidPhone =>
      'Enter a valid Philippine mobile number.',
    PhoneVerificationFailureKind.tooManyRequests =>
      'Too many attempts. Wait before trying again.',
    PhoneVerificationFailureKind.phoneAlreadyInUse =>
      'This phone number is already associated with another account.',
    PhoneVerificationFailureKind.sessionExpired =>
      'Your session expired. Sign in and try again.',
    PhoneVerificationFailureKind.blocked =>
      'This account cannot verify a phone number.',
    PhoneVerificationFailureKind.network =>
      'Check your connection and try again.',
    PhoneVerificationFailureKind.configuration =>
      'Phone verification is temporarily unavailable.',
    PhoneVerificationFailureKind.invalidCode =>
      'The verification code is incorrect.',
    PhoneVerificationFailureKind.expiredCode =>
      'The code expired. Request a new code.',
    PhoneVerificationFailureKind.unknown =>
      'Phone verification could not be completed.',
  };

  void _startCooldown() {
    _timer?.cancel();
    var seconds = resendCooldown.inSeconds.clamp(1, 3600);
    state = state.copyWith(cooldownSeconds: seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      seconds--;
      state = state.copyWith(cooldownSeconds: seconds);
      notifyListeners();
      if (seconds <= 0) timer.cancel();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
