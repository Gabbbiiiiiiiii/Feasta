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
    this.codeRequested = false,
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
  final bool codeRequested;
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
    bool? codeRequested,
    int? cooldownSeconds,
    String? phoneError,
    String? codeError,
    String? error,
    String? notice,
    bool clearErrors = false,
    bool clearVerificationId = false,
    bool clearResendToken = false,
    bool clearNotice = false,
  }) {
    return PhoneVerificationState(
      normalizedPhone: normalizedPhone ?? this.normalizedPhone,
      verificationId: clearVerificationId
          ? null
          : verificationId ?? this.verificationId,
      resendToken: clearResendToken ? null : resendToken ?? this.resendToken,
      isSending: isSending ?? this.isSending,
      isConfirming: isConfirming ?? this.isConfirming,
      isVerified: isVerified ?? this.isVerified,
      codeRequested: codeRequested ?? this.codeRequested,
      cooldownSeconds: cooldownSeconds ?? this.cooldownSeconds,
      phoneError: phoneError ?? (clearErrors ? null : this.phoneError),
      codeError: codeError ?? (clearErrors ? null : this.codeError),
      error: error ?? (clearErrors ? null : this.error),
      notice: clearNotice ? null : notice ?? this.notice,
    );
  }
}

class PhoneVerificationController extends ChangeNotifier {
  PhoneVerificationController({
    required this.gateway,
    this.resendCooldown = const Duration(seconds: 60),
    this.maximumConfirmationAttempts = 5,
  }) : assert(maximumConfirmationAttempts > 0);

  final PhoneVerificationGateway gateway;
  final Duration resendCooldown;
  final int maximumConfirmationAttempts;

  PhoneVerificationState state = const PhoneVerificationState();

  Timer? _timer;
  int _confirmationAttempts = 0;
  bool _disposed = false;

  Future<void> sendCode(String rawPhone, {bool resend = false}) async {
    if (_disposed ||
        state.isSending ||
        state.isConfirming ||
        state.cooldownSeconds > 0) {
      return;
    }

    final phone = normalizePhilippineMobile(rawPhone);

    if (phone == null) {
      _updateState(
        state.copyWith(
          phoneError: 'Enter a valid Philippine mobile number.',
          clearErrors: true,
        ),
      );
      return;
    }

    _updateState(
      state.copyWith(
        normalizedPhone: phone,
        isSending: true,
        clearErrors: true,
        clearNotice: true,
      ),
    );

    try {
      await gateway.requestCode(
        phoneNumber: phone,
        resendToken: resend ? state.resendToken : null,
        onCodeSent: (verificationId, resendToken) {
          if (_disposed) return;

          _confirmationAttempts = 0;

          _updateState(
            state.copyWith(
              verificationId: verificationId,
              resendToken: resendToken,
              isSending: false,
              codeRequested: true,
              notice:
                  'We sent a verification code to ${maskPhilippineMobile(phone)}.',
              clearErrors: true,
            ),
          );

          _startCooldown();
        },
        onVerified: () async {
          if (_disposed) return;

          _timer?.cancel();
          _confirmationAttempts = 0;

          _updateState(
            state.copyWith(
              isSending: false,
              isConfirming: false,
              isVerified: true,
              codeRequested: false,
              cooldownSeconds: 0,
              clearErrors: true,
            ),
          );
        },
        onFailure: _handleFailure,
        onTimeout: (verificationId) {
          if (_disposed) return;

          // Auto-retrieval timing out is not the same as the SMS code expiring.
          _updateState(
            state.copyWith(verificationId: verificationId, isSending: false),
          );
        },
      );
    } on PhoneVerificationException catch (error) {
      _handleFailure(error);
    }
  }

  Future<bool> confirmCode(String code) async {
    if (_disposed || state.isSending || state.isConfirming) {
      return false;
    }

    if (_confirmationAttempts >= maximumConfirmationAttempts) {
      _expireCurrentCode('Too many code attempts. Request a new code.');
      return false;
    }

    final verificationId = state.verificationId;

    if (verificationId == null) {
      _updateState(
        state.copyWith(
          codeError: 'Request a verification code first.',
          clearErrors: true,
        ),
      );
      return false;
    }

    final normalizedCode = code.trim();

    if (!RegExp(r'^\d{6}$').hasMatch(normalizedCode)) {
      _updateState(
        state.copyWith(
          codeError: 'Enter the 6-digit verification code.',
          clearErrors: true,
        ),
      );
      return false;
    }

    _confirmationAttempts++;

    _updateState(state.copyWith(isConfirming: true, clearErrors: true));

    try {
      await gateway.confirmCode(
        verificationId: verificationId,
        smsCode: normalizedCode,
      );

      if (_disposed) return false;

      _timer?.cancel();
      _confirmationAttempts = 0;

      _updateState(
        state.copyWith(
          isConfirming: false,
          isVerified: true,
          codeRequested: false,
          cooldownSeconds: 0,
          clearErrors: true,
        ),
      );

      return true;
    } on PhoneVerificationException catch (error) {
      _handleFailure(error);
      return false;
    }
  }

  void _handleFailure(PhoneVerificationException exception) {
    if (_disposed) return;

    switch (exception.kind) {
      case PhoneVerificationFailureKind.expiredCode:
        _expireCurrentCode('The code expired. Request a new code.');
        return;
      case PhoneVerificationFailureKind.sessionExpired:
        _timer?.cancel();
        _confirmationAttempts = 0;
        _updateState(
          state.copyWith(
            isSending: false,
            isConfirming: false,
            codeRequested: false,
            cooldownSeconds: 0,
            error: messageFor(exception.kind),
            clearErrors: true,
            clearVerificationId: true,
            clearResendToken: true,
            clearNotice: true,
          ),
        );
        return;
      case PhoneVerificationFailureKind.invalidCode:
        _updateState(
          state.copyWith(
            isSending: false,
            isConfirming: false,
            codeError: 'The verification code is incorrect.',
            clearErrors: true,
          ),
        );
        return;
      default:
        _updateState(
          state.copyWith(
            isSending: false,
            isConfirming: false,
            error: messageFor(exception.kind),
            clearErrors: true,
          ),
        );
    }
  }

  void _expireCurrentCode(String message) {
    _timer?.cancel();
    _confirmationAttempts = 0;

    _updateState(
      state.copyWith(
        isSending: false,
        isConfirming: false,
        codeRequested: true,
        cooldownSeconds: 0,
        codeError: message,
        clearErrors: true,
        clearVerificationId: true,
        clearResendToken: true,
        clearNotice: true,
      ),
    );
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

    _updateState(state.copyWith(cooldownSeconds: seconds));

    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_disposed) {
        timer.cancel();
        return;
      }

      seconds--;
      _updateState(state.copyWith(cooldownSeconds: seconds));

      if (seconds <= 0) timer.cancel();
    });
  }

  void _updateState(PhoneVerificationState value) {
    if (_disposed) return;
    state = value;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}
