import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';
import '../../authentication/application/customer_auth_scope.dart';
import '../../authentication/application/email_verification_controller.dart';
import '../../authentication/data/repositories/auth_repository.dart';
import '../../authentication/domain/account_recovery.dart';
import 'login_screen.dart';

class EmailVerificationScreen extends StatefulWidget {
  const EmailVerificationScreen({
    required this.email,
    this.managedByAuthenticationGate = false,
    this.initialNotice,
    this.verificationGateway,
    this.resendCooldown = const Duration(seconds: 60),
    this.onVerified,
    this.onLogout,
    super.key,
  });

  final String email;
  final bool managedByAuthenticationGate;
  final String? initialNotice;
  final EmailVerificationGateway? verificationGateway;
  final Duration resendCooldown;
  final FutureOr<void> Function()? onVerified;
  final FutureOr<void> Function()? onLogout;

  @override
  State<EmailVerificationScreen> createState() =>
      _EmailVerificationScreenState();
}

class _EmailVerificationScreenState extends State<EmailVerificationScreen> {
  late final EmailVerificationGateway _gateway;
  late final EmailVerificationController _controller;

  @override
  void initState() {
    super.initState();
    _gateway = widget.verificationGateway ?? AuthRepository();
    _controller = EmailVerificationController(
      gateway: _gateway,
      resendCooldown: widget.resendCooldown,
    )..addListener(_stateChanged);
  }

  void _stateChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _refresh() async {
    final verified = await _controller.refresh();
    if (!mounted || !verified) return;
    if (widget.onVerified != null) {
      await widget.onVerified!();
      return;
    }
    final gate = CustomerAuthenticationScope.maybeOf(context);
    if (gate != null) {
      await gate.refresh(forceTokenRefresh: true);
      return;
    }
    await _gateway.logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _logout() async {
    if (widget.onLogout != null) {
      await widget.onLogout!();
      return;
    }
    final gate = CustomerAuthenticationScope.maybeOf(context);
    if (gate != null) {
      await gate.signOut();
      return;
    }
    await _gateway.logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_stateChanged)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = _controller.state;
    final notice = state.notice ?? widget.initialNotice;
    final cooldown = state.cooldownSeconds;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Verify your email'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          child: FeastaContentContainer(
            maxWidth: 600,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(
                  Icons.mark_email_unread_outlined,
                  size: 72,
                  color: AppColors.primary,
                  semanticLabel: 'Email verification required',
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  'Check your inbox',
                  textAlign: TextAlign.center,
                  style: AppTypography.headline,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'We sent a verification link to ${maskEmail(widget.email)}. Open the newest link, then return here to check your status.',
                  textAlign: TextAlign.center,
                  style: AppTypography.body.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
                if (state.error != null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _VerificationMessage(
                    key: const Key('verification-error'),
                    message: state.error!,
                    error: true,
                  ),
                ],
                if (notice != null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _VerificationMessage(message: notice, error: false),
                ],
                const SizedBox(height: AppSpacing.xl),
                FeastaPrimaryButton(
                  key: const Key('check-verification'),
                  label: 'Check verification',
                  loadingLabel: 'Checking verification',
                  isLoading: state.isRefreshing,
                  onPressed: state.isResending || state.isRefreshing
                      ? null
                      : _refresh,
                ),
                const SizedBox(height: AppSpacing.sm),
                FeastaSecondaryButton(
                  key: const Key('resend-verification'),
                  label: cooldown > 0
                      ? 'Resend available in ${cooldown}s'
                      : 'Resend verification email',
                  loadingLabel: 'Sending verification email',
                  isLoading: state.isResending,
                  onPressed:
                      cooldown > 0 || state.isResending || state.isRefreshing
                      ? null
                      : _controller.resend,
                ),
                const SizedBox(height: AppSpacing.md),
                FeastaTextButton(
                  label: 'Logout and change account',
                  onPressed: state.isResending || state.isRefreshing
                      ? null
                      : _logout,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VerificationMessage extends StatelessWidget {
  const _VerificationMessage({
    required this.message,
    required this.error,
    super.key,
  });
  final String message;
  final bool error;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    container: true,
    child: Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      color: error ? AppColors.errorSubtle : AppColors.infoSubtle,
      child: Text(
        message,
        style: AppTypography.body.copyWith(
          color: error ? AppColors.error : AppColors.info,
        ),
      ),
    ),
  );
}
