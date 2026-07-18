import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';
import '../../authentication/application/customer_auth_scope.dart';
import '../../authentication/application/customer_login_controller.dart';
import '../../authentication/data/repositories/auth_repository.dart';
import '../../authentication/domain/customer_login.dart';
import '../../customer/customer_main_screen.dart';
import 'email_verification_screen.dart';
import 'forgot_password_screen.dart';
import 'role_selection_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    this.canSkip = true,
    this.redirectAfterLogin,
    this.managedByAuthenticationGate = false,
    this.loginGateway,
    this.onLoginComplete,
    super.key,
  });

  final bool canSkip;
  final Widget? redirectAfterLogin;
  final bool managedByAuthenticationGate;
  final CustomerLoginGateway? loginGateway;
  final FutureOr<void> Function(CustomerLoginResult result)? onLoginComplete;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
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
    )..addListener(_stateChanged);
  }

  void _stateChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _emailLogin() async {
    FocusScope.of(context).unfocus();
    final result = await _controller.signInWithEmail(
      email: _emailController.text,
      password: _passwordController.text,
    );
    await _complete(result);
  }

  Future<void> _googleLogin() async {
    FocusScope.of(context).unfocus();
    final result = await _controller.signInWithGoogle();
    await _complete(result);
  }

  Future<void> _complete(CustomerLoginResult? result) async {
    if (!mounted || result == null) return;
    if (widget.onLoginComplete != null) {
      await widget.onLoginComplete!(result);
      return;
    }
    if (widget.managedByAuthenticationGate) {
      await CustomerAuthenticationScope.of(context).refresh();
      return;
    }
    if (!result.emailVerified) {
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => EmailVerificationScreen(email: result.email ?? ''),
        ),
        (_) => false,
      );
      return;
    }
    final destination = widget.redirectAfterLogin ?? const CustomerMainScreen();
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => destination),
      (_) => false,
    );
  }

  void _continueAsGuest() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const CustomerMainScreen()),
      (_) => false,
    );
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_stateChanged)
      ..dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = _controller.state;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: widget.canSkip
          ? AppBar(
              leading: IconButton(
                tooltip: 'Continue as guest',
                onPressed: state.isSubmitting ? null : _continueAsGuest,
                icon: const Icon(Icons.close_rounded),
              ),
            )
          : null,
      body: SafeArea(
        child: AutofillGroup(
          child: SingleChildScrollView(
            child: FeastaContentContainer(
              maxWidth: 600,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Image.asset(
                      'assets/images/mobile_logo.png',
                      width: 72,
                      height: 72,
                      semanticLabel: 'FEASTA',
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text('Welcome back', style: AppTypography.headline),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'Sign in to manage your bookings and account.',
                    style: AppTypography.body.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
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
                          : () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const ForgotPasswordScreen(),
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  FeastaPrimaryButton(
                    key: const Key('email-login-button'),
                    label: 'Log in',
                    loadingLabel: 'Signing in',
                    isLoading: state.isSubmitting,
                    onPressed: state.isSubmitting ? null : _emailLogin,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  const Row(
                    children: [
                      Expanded(child: Divider()),
                      Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                        ),
                        child: Text('or'),
                      ),
                      Expanded(child: Divider()),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  FeastaSecondaryButton(
                    key: const Key('google-login-button'),
                    label: 'Continue with Google',
                    onPressed: state.isSubmitting ? null : _googleLogin,
                    icon: Image.asset(
                      'assets/images/google_logo.png',
                      width: 22,
                      height: 22,
                      excludeFromSemantics: true,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Center(
                    child: FeastaTextButton(
                      label: 'Create a customer account',
                      onPressed: state.isSubmitting
                          ? null
                          : () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const RoleSelectionScreen(),
                              ),
                            ),
                    ),
                  ),
                ],
              ),
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
        ),
        child: Text(message, style: AppTypography.body.copyWith(color: color)),
      ),
    );
  }
}
