import 'package:flutter/material.dart';
import '../../../app/router/customer_auth_navigation.dart';
import '../../../app/router/customer_route_guard.dart';

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

  Future<void> _submit() async {
    if (_controller.state.isSubmitting) return;
    FocusScope.of(context).unfocus();
    await _controller.submit(_emailController.text);
  }

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
    if (returnToCustomerAuthenticationGate(
      context,
      intendedLocation: CustomerAppLocations.login,
    )) {
      return;
    }
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
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
    final confirmed = state.success;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Reset your password')),
      body: SafeArea(
        child: SingleChildScrollView(
          child: FeastaContentContainer(
            maxWidth: 520,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: AppSpacing.lg),
                Center(
                  child: Container(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    decoration: BoxDecoration(
                      color: confirmed
                          ? AppColors.successSubtle
                          : AppColors.surfaceMuted,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      confirmed
                          ? Icons.mark_email_read_rounded
                          : Icons.lock_reset_rounded,
                      size: 64,
                      color: confirmed ? AppColors.success : AppColors.primary,
                      semanticLabel: confirmed
                          ? 'Reset request complete'
                          : 'Password reset',
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                Semantics(
                  key: confirmed ? const Key('password-reset-success') : null,
                  liveRegion: confirmed,
                  header: true,
                  child: Text(
                    confirmed ? 'Check your email' : 'Reset your password',
                    textAlign: TextAlign.center,
                    style: AppTypography.headline,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  confirmed
                      ? 'If a FEASTA account exists for this email, you will receive a link to reset your password. Check your inbox and spam folder.'
                      : 'Enter your email address to request a password reset link.',
                  textAlign: TextAlign.center,
                  style: AppTypography.body.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                if (!confirmed) ...[
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
                    onSubmitted: (_) => _submit(),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
                if (state.error != null) ...[
                  Semantics(
                    liveRegion: true,
                    child: Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        color: AppColors.errorSubtle,
                        border: Border.all(color: AppColors.error),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        state.error!,
                        key: const Key('password-reset-error'),
                        style: AppTypography.error,
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
                if (confirmed) ...[
                  FeastaPrimaryButton(
                    key: const Key('password-reset-back-to-sign-in'),
                    label: 'Back to sign in',
                    onPressed: _returnToLogin,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  FeastaTextButton(
                    key: const Key('resend-password-reset'),
                    label: 'Resend reset link',
                    onPressed: _submit,
                  ),
                ] else ...[
                  FeastaPrimaryButton(
                    key: const Key('request-password-reset'),
                    label: 'Send reset link',
                    loadingLabel: 'Sending reset link…',
                    isLoading: state.isSubmitting,
                    onPressed: state.isSubmitting ? null : _submit,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  FeastaTextButton(
                    label: 'Back to sign in',
                    onPressed: state.isSubmitting ? null : _returnToLogin,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
