import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pinput/pinput.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../authentication/application/customer_auth_scope.dart';
import '../authentication/application/phone_verification_controller.dart';
import '../authentication/data/services/firebase_phone_verification_service.dart';

class PhoneVerificationScreen extends StatefulWidget {
  const PhoneVerificationScreen({
    this.controller,
    this.requiredForBooking = false,
    this.onAccountRefresh,
    this.onVerified,
    super.key,
  });

  final PhoneVerificationController? controller;
  final bool requiredForBooking;
  final Future<void> Function()? onAccountRefresh;
  final FutureOr<void> Function()? onVerified;

  @override
  State<PhoneVerificationScreen> createState() =>
      _PhoneVerificationScreenState();
}

class _PhoneVerificationScreenState extends State<PhoneVerificationScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  late final PhoneVerificationController _controller;
  late final bool _ownsController;
  bool _completionHandled = false;

  @override
  void initState() {
    super.initState();
    _ownsController = widget.controller == null;
    _controller =
        widget.controller ??
        PhoneVerificationController(
          gateway: FirebasePhoneVerificationService(),
        );
    _controller.addListener(_stateChanged);
  }

  void _stateChanged() {
    if (mounted) setState(() {});
    if (_controller.state.isVerified && !_completionHandled) {
      _completionHandled = true;
      unawaited(_completeVerification());
    }
  }

  Future<void> _completeVerification() async {
    if (widget.onAccountRefresh != null) {
      await widget.onAccountRefresh!();
    } else {
      await CustomerAuthenticationScope.maybeOf(
        context,
      )?.refresh(forceTokenRefresh: true);
    }
    if (widget.onVerified != null) await widget.onVerified!();
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  @override
  void dispose() {
    _controller.removeListener(_stateChanged);
    if (_ownsController) _controller.dispose();
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = _controller.state;
    final hasCode = state.verificationId != null;
    final busy = state.isSending || state.isConfirming;
    final pinTheme = PinTheme(
      width: 48,
      height: 56,
      textStyle: AppTypography.title,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Verify mobile number'),
        leading: IconButton(
          tooltip: widget.requiredForBooking ? 'Return to booking' : 'Close',
          onPressed: busy ? null : () => Navigator.of(context).pop(false),
          icon: const Icon(Icons.close_rounded),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: FeastaContentContainer(
            maxWidth: 600,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(
                  Icons.phone_android_rounded,
                  size: 64,
                  color: AppColors.primary,
                  semanticLabel: 'Phone verification',
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  hasCode
                      ? 'Enter your verification code'
                      : 'Confirm your mobile number',
                  style: AppTypography.headline,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  widget.requiredForBooking
                      ? 'A verified phone number is required to submit a booking. You can return without submitting.'
                      : 'Verify your phone when you are ready. Browsing remains available without it.',
                  style: AppTypography.body.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.xl),
                if (!hasCode)
                  FeastaTextField(
                    label: 'Philippine mobile number',
                    controller: _phoneController,
                    helperText:
                        'Use +639XXXXXXXXX, 09XXXXXXXXX, or 9XXXXXXXXX.',
                    errorText: state.phoneError,
                    isRequired: true,
                    enabled: !busy,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9+() -]')),
                      LengthLimitingTextInputFormatter(20),
                    ],
                    onSubmitted: (_) =>
                        _controller.sendCode(_phoneController.text),
                  )
                else ...[
                  Semantics(
                    label: 'Six digit verification code',
                    textField: true,
                    child: Pinput(
                      key: const Key('phone-otp-field'),
                      controller: _otpController,
                      length: 6,
                      enabled: !busy,
                      keyboardType: TextInputType.number,
                      defaultPinTheme: pinTheme,
                      focusedPinTheme: pinTheme.copyDecorationWith(
                        border: Border.all(color: AppColors.focus, width: 2),
                      ),
                      errorPinTheme: pinTheme.copyDecorationWith(
                        border: Border.all(color: AppColors.error, width: 2),
                      ),
                      onCompleted: (_) => _confirm(),
                    ),
                  ),
                  if (state.codeError != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Semantics(
                      liveRegion: true,
                      child: Text(state.codeError!, style: AppTypography.error),
                    ),
                  ],
                ],
                if (state.notice != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  Semantics(
                    liveRegion: true,
                    child: Text(state.notice!, style: AppTypography.helper),
                  ),
                ],
                if (state.error != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      state.error!,
                      key: const Key('phone-verification-error'),
                      style: AppTypography.error,
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.xl),
                FeastaPrimaryButton(
                  key: const Key('phone-verification-primary'),
                  label: hasCode ? 'Verify code' : 'Send verification code',
                  loadingLabel: hasCode ? 'Verifying code' : 'Sending code',
                  isLoading: busy,
                  onPressed: busy
                      ? null
                      : hasCode
                      ? _confirm
                      : () => _controller.sendCode(_phoneController.text),
                ),
                if (hasCode) ...[
                  const SizedBox(height: AppSpacing.sm),
                  FeastaSecondaryButton(
                    key: const Key('resend-phone-code'),
                    label: state.cooldownSeconds > 0
                        ? 'Resend available in ${state.cooldownSeconds}s'
                        : 'Resend code',
                    onPressed: busy || state.cooldownSeconds > 0
                        ? null
                        : () => _controller.sendCode(
                            state.normalizedPhone ?? _phoneController.text,
                            resend: true,
                          ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _confirm() async {
    await _controller.confirmCode(_otpController.text);
  }
}
