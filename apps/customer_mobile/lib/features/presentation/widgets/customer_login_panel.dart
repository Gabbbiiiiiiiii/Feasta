import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radius.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';
import '../../authentication/application/customer_login_controller.dart';
import '../../authentication/data/repositories/auth_repository.dart';
import '../../authentication/domain/customer_login.dart';
import 'feasta_google_auth_button.dart';

class CustomerLoginPanel extends StatefulWidget {
  const CustomerLoginPanel({
    required this.onLoginComplete,
    required this.onForgotPassword,
    required this.onCreateAccount,
    this.onClose,
    this.contextMessage,
    this.loginGateway,
    super.key,
  });

  final FutureOr<void> Function(CustomerLoginResult result) onLoginComplete;
  final VoidCallback onForgotPassword;
  final VoidCallback onCreateAccount;
  final VoidCallback? onClose;
  final String? contextMessage;
  final CustomerLoginGateway? loginGateway;

  @override
  State<CustomerLoginPanel> createState() => _CustomerLoginPanelState();
}

class _CustomerLoginPanelState extends State<CustomerLoginPanel> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();

  late final CustomerLoginController _controller;

  @override
  void initState() {
    super.initState();

    _controller = CustomerLoginController(
      gateway: widget.loginGateway ?? AuthRepository(),
    )..addListener(_handleControllerChanged);
  }

  void _handleControllerChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _emailLogin() async {
    FocusScope.of(context).unfocus();

    final result = await _controller.signInWithEmail(
      email: _emailController.text,
      password: _passwordController.text,
    );

    if (!mounted || result == null) {
      return;
    }

    await widget.onLoginComplete(result);
  }

  Future<void> _googleLogin() async {
    FocusScope.of(context).unfocus();

    final result = await _controller.signInWithGoogle();

    if (!mounted || result == null) {
      return;
    }

    await widget.onLoginComplete(result);
  }

  @override
  void dispose() {
    _controller.removeListener(_handleControllerChanged);
    _controller.dispose();

    _emailController.dispose();
    _passwordController.dispose();

    _emailFocus.dispose();
    _passwordFocus.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = _controller.state;

    return AutofillGroup(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.xl,
              AppSpacing.sm,
              AppSpacing.xl,
              AppSpacing.xxl,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (widget.onClose != null)
                  Align(
                    alignment: Alignment.centerRight,
                    child: IconButton(
                      tooltip: 'Close',
                      onPressed: state.isSubmitting ? null : widget.onClose,
                      icon: const Icon(Icons.close_rounded, size: 30),
                    ),
                  )
                else
                  const SizedBox(height: AppSpacing.md),

                const SizedBox(height: AppSpacing.sm),

                Center(
                  child: Image.asset(
                    'assets/images/feasta_logo.png',
                    width: 88,
                    height: 88,
                    fit: BoxFit.contain,
                    semanticLabel: 'FEASTA logo',
                  ),
                ),

                const SizedBox(height: AppSpacing.xl),

                Text(
                  'Log in or sign up',
                  textAlign: TextAlign.center,
                  style: AppTypography.headline.copyWith(
                    color: AppColors.mainText,
                  ),
                ),

                if (widget.contextMessage != null &&
                    widget.contextMessage!.trim().isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    widget.contextMessage!,
                    textAlign: TextAlign.center,
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                ],

                const SizedBox(height: AppSpacing.xl),

                if (state.generalError != null) ...[
                  _LoginMessage(
                    key: const Key('login-error-summary'),
                    message: state.generalError!,
                    isError: true,
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],

                if (state.notice != null) ...[
                  _LoginMessage(message: state.notice!, isError: false),
                  const SizedBox(height: AppSpacing.md),
                ],

                FeastaTextField(
                  label: 'Email address',
                  controller: _emailController,
                  focusNode: _emailFocus,
                  nextFocusNode: _passwordFocus,
                  errorText: state.emailError,
                  isRequired: true,
                  enabled: !state.isSubmitting,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [
                    AutofillHints.username,
                    AutofillHints.email,
                  ],
                  autocorrect: false,
                ),

                const SizedBox(height: AppSpacing.md),

                FeastaTextField(
                  label: 'Password',
                  controller: _passwordController,
                  focusNode: _passwordFocus,
                  errorText: state.passwordError,
                  isRequired: true,
                  isPassword: true,
                  enabled: !state.isSubmitting,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.password],
                  onSubmitted: (_) => _emailLogin(),
                ),

                Align(
                  alignment: Alignment.centerRight,
                  child: FeastaTextButton(
                    label: 'Forgot password?',
                    onPressed: state.isSubmitting
                        ? null
                        : widget.onForgotPassword,
                  ),
                ),

                const SizedBox(height: AppSpacing.sm),

                SizedBox(
                  height: 58,
                  child: FilledButton(
                    key: const Key('email-login-button'),
                    onPressed: state.isSubmitting ? null : _emailLogin,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: AppColors.disabled,
                      disabledForegroundColor: AppColors.disabledForeground,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppRadius.large),
                      ),
                    ),
                    child: state.isEmailSubmitting
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            'Continue',
                            style: AppTypography.button.copyWith(
                              color: Colors.white,
                            ),
                          ),
                  ),
                ),

                const SizedBox(height: AppSpacing.xl),

                Row(
                  children: [
                    const Expanded(child: Divider(color: AppColors.border)),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                      ),
                      child: Text(
                        'or',
                        style: AppTypography.body.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                    ),
                    const Expanded(child: Divider(color: AppColors.border)),
                  ],
                ),

                const SizedBox(height: AppSpacing.xl),

                FeastaGoogleAuthButton(
                  key: const Key('google-login-button'),
                  isLoading: state.isGoogleSubmitting,
                  onPressed: state.isSubmitting ? null : _googleLogin,
                ),

                const SizedBox(height: AppSpacing.xl),

                Wrap(
                  alignment: WrapAlignment.center,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      'New to Feasta?',
                      style: AppTypography.body.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                    FeastaTextButton(
                      label: 'Create account',
                      onPressed: state.isSubmitting
                          ? null
                          : widget.onCreateAccount,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LoginMessage extends StatelessWidget {
  const _LoginMessage({
    required this.message,
    required this.isError,
    super.key,
  });

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final color = isError ? AppColors.error : AppColors.info;

    return Semantics(
      container: true,
      liveRegion: true,
      label: '${isError ? 'Sign-in error' : 'Sign-in status'}: $message',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: isError ? AppColors.errorSubtle : AppColors.infoSubtle,
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(AppRadius.medium),
        ),
        child: Text(message, style: AppTypography.body.copyWith(color: color)),
      ),
    );
  }
}
