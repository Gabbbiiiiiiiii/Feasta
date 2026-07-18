import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';
import '../../authentication/application/password_reset_controller.dart';
import '../../authentication/data/repositories/auth_repository.dart';
import '../../authentication/domain/account_recovery.dart';
import 'login_screen.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({this.resetGateway, super.key});
  final PasswordResetGateway? resetGateway;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  late final PasswordResetController _controller;

  @override
  void initState() {
    super.initState();
    _controller = PasswordResetController(
      gateway: widget.resetGateway ?? AuthRepository(),
    )..addListener(_stateChanged);
  }

  void _stateChanged() {
    if (mounted) setState(() {});
  }

  void _returnToLogin() {
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
    _emailController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = _controller.state;
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: SafeArea(
        child: SingleChildScrollView(
          child: FeastaContentContainer(
            maxWidth: 600,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(
                  Icons.lock_reset_rounded,
                  size: 72,
                  color: AppColors.primary,
                  semanticLabel: 'Password reset',
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  'Can’t access your account?',
                  style: AppTypography.headline,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Enter your email. If it is eligible, we’ll send password reset instructions.',
                  style: AppTypography.body.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                FeastaTextField(
                  label: 'Email address',
                  controller: _emailController,
                  errorText: state.emailError,
                  isRequired: true,
                  enabled: !state.isSubmitting,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.email],
                  autocorrect: false,
                  onSubmitted: (_) => _controller.submit(_emailController.text),
                ),
                if (state.error != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      state.error!,
                      key: const Key('password-reset-error'),
                      style: AppTypography.error,
                    ),
                  ),
                ],
                if (state.success) ...[
                  const SizedBox(height: AppSpacing.md),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      'If this email is eligible, password reset instructions will arrive shortly.',
                      key: const Key('password-reset-success'),
                      style: AppTypography.body.copyWith(
                        color: AppColors.success,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.xl),
                FeastaPrimaryButton(
                  key: const Key('request-password-reset'),
                  label: state.success
                      ? 'Send again'
                      : 'Send reset instructions',
                  loadingLabel: 'Sending instructions',
                  isLoading: state.isSubmitting,
                  onPressed: state.isSubmitting
                      ? null
                      : () => _controller.submit(_emailController.text),
                ),
                const SizedBox(height: AppSpacing.sm),
                FeastaTextButton(
                  label: 'Return to login',
                  onPressed: state.isSubmitting ? null : _returnToLogin,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
