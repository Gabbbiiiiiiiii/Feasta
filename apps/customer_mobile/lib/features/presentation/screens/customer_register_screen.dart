import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_breakpoints.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';
import '../../authentication/application/customer_auth_scope.dart';
import '../../authentication/application/customer_registration_controller.dart';
import '../../authentication/data/repositories/auth_repository.dart';
import '../../authentication/domain/customer_registration.dart';
import 'email_verification_screen.dart';
import 'login_screen.dart';

class CustomerRegisterScreen extends StatefulWidget {
  const CustomerRegisterScreen({
    this.registrationGateway,
    this.onRegistrationComplete,
    this.onOpenTerms,
    this.onOpenPrivacy,
    super.key,
  });

  final CustomerRegistrationGateway? registrationGateway;
  final FutureOr<void> Function(CustomerRegistrationResult result)?
  onRegistrationComplete;
  final VoidCallback? onOpenTerms;
  final VoidCallback? onOpenPrivacy;

  @override
  State<CustomerRegisterScreen> createState() => _CustomerRegisterScreenState();
}

class _CustomerRegisterScreenState extends State<CustomerRegisterScreen> {
  static const _termsUrl = String.fromEnvironment('FEASTA_TERMS_URL');
  static const _privacyUrl = String.fromEnvironment('FEASTA_PRIVACY_URL');

  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _firstNameFocus = FocusNode();
  final _lastNameFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  final _confirmPasswordFocus = FocusNode();

  late final CustomerRegistrationController _controller;
  bool _acceptedTerms = false;
  bool _acceptedPrivacy = false;

  @override
  void initState() {
    super.initState();
    _controller = CustomerRegistrationController(
      gateway: widget.registrationGateway ?? AuthRepository(),
    )..addListener(_handleStateChanged);
  }

  void _handleStateChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final result = await _controller.submit(
      firstName: _firstNameController.text,
      lastName: _lastNameController.text,
      email: _emailController.text,
      password: _passwordController.text,
      confirmPassword: _confirmPasswordController.text,
      acceptedTerms: _acceptedTerms,
      acceptedPrivacy: _acceptedPrivacy,
    );
    if (!mounted || result == null) return;

    final onComplete = widget.onRegistrationComplete;
    if (onComplete != null) {
      await onComplete(result);
      return;
    }

    final gateController = CustomerAuthenticationScope.maybeOf(context);
    if (gateController != null) await gateController.refresh();
    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => EmailVerificationScreen(
          email: result.email,
          managedByAuthenticationGate: gateController != null,
          initialNotice: result.verificationEmailSent
              ? null
              : 'Your account is ready, but the verification email could not be sent. Use Resend verification on this screen.',
        ),
      ),
      (_) => false,
    );
  }

  Future<void> _openLegalUrl(String configuredUrl, String label) async {
    final uri = Uri.tryParse(configuredUrl);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
      if (!mounted) return;
      FeastaSnackbars.show(
        context,
        message: '$label is temporarily unavailable. Please try again later.',
        tone: FeastaSnackbarTone.warning,
      );
      return;
    }
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      FeastaSnackbars.show(
        context,
        message: 'Unable to open $label.',
        tone: FeastaSnackbarTone.error,
      );
    }
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_handleStateChanged)
      ..dispose();
    for (final controller in [
      _firstNameController,
      _lastNameController,
      _emailController,
      _passwordController,
      _confirmPasswordController,
    ]) {
      controller.dispose();
    }
    for (final focus in [
      _firstNameFocus,
      _lastNameFocus,
      _emailFocus,
      _passwordFocus,
      _confirmPasswordFocus,
    ]) {
      focus.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = _controller.state;
    final errors = state.errors;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Close registration',
          onPressed: state.isSubmitting
              ? null
              : () => Navigator.maybePop(context),
          icon: const Icon(Icons.close_rounded),
        ),
        title: const Text('Create customer account'),
      ),
      body: SafeArea(
        child: AutofillGroup(
          child: SingleChildScrollView(
            child: FeastaContentContainer(
              maxWidth: AppBreakpoints.tablet,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Join FEASTA', style: AppTypography.headline),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'Create a customer account to plan and book your event.',
                    style: AppTypography.body.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  if (state.generalError != null) ...[
                    Semantics(
                      liveRegion: true,
                      label: 'Registration error: ${state.generalError}',
                      child: Container(
                        key: const Key('registration-error-summary'),
                        width: double.infinity,
                        padding: const EdgeInsets.all(AppSpacing.md),
                        decoration: BoxDecoration(
                          color: AppColors.errorSubtle,
                          border: Border.all(color: AppColors.error),
                        ),
                        child: Text(
                          state.generalError!,
                          style: AppTypography.body.copyWith(
                            color: AppColors.error,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final stack =
                          constraints.maxWidth < AppBreakpoints.tablet ||
                          MediaQuery.textScalerOf(context).scale(1) > 1.3;
                      final first = FeastaTextField(
                        label: 'First name',
                        controller: _firstNameController,
                        focusNode: _firstNameFocus,
                        nextFocusNode: _lastNameFocus,
                        errorText: errors.firstName,
                        isRequired: true,
                        enabled: !state.isSubmitting,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.givenName],
                        maxLength: 80,
                      );
                      final last = FeastaTextField(
                        label: 'Last name',
                        controller: _lastNameController,
                        focusNode: _lastNameFocus,
                        nextFocusNode: _emailFocus,
                        errorText: errors.lastName,
                        isRequired: true,
                        enabled: !state.isSubmitting,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.familyName],
                        maxLength: 80,
                      );
                      return stack
                          ? Column(
                              children: [
                                first,
                                const SizedBox(height: AppSpacing.md),
                                last,
                              ],
                            )
                          : Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(child: first),
                                const SizedBox(width: AppSpacing.md),
                                Expanded(child: last),
                              ],
                            );
                    },
                  ),
                  const SizedBox(height: AppSpacing.md),
                  FeastaTextField(
                    label: 'Email address',
                    controller: _emailController,
                    focusNode: _emailFocus,
                    nextFocusNode: _passwordFocus,
                    errorText: errors.email,
                    isRequired: true,
                    enabled: !state.isSubmitting,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    autocorrect: false,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  FeastaTextField(
                    label: 'Password',
                    controller: _passwordController,
                    focusNode: _passwordFocus,
                    nextFocusNode: _confirmPasswordFocus,
                    errorText: errors.password,
                    helperText: 'Use at least 6 characters.',
                    isRequired: true,
                    isPassword: true,
                    enabled: !state.isSubmitting,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.newPassword],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  FeastaTextField(
                    label: 'Confirm password',
                    controller: _confirmPasswordController,
                    focusNode: _confirmPasswordFocus,
                    errorText: errors.confirmPassword,
                    isRequired: true,
                    isPassword: true,
                    enabled: !state.isSubmitting,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.newPassword],
                    onSubmitted: (_) => _submit(),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _ConsentControl(
                    key: const Key('terms-consent'),
                    value: _acceptedTerms,
                    enabled: !state.isSubmitting,
                    label: 'I accept the Terms of Service.',
                    linkLabel: 'Read Terms of Service',
                    error: errors.terms,
                    onChanged: (value) =>
                        setState(() => _acceptedTerms = value),
                    onOpen:
                        widget.onOpenTerms ??
                        () => _openLegalUrl(_termsUrl, 'Terms of Service'),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _ConsentControl(
                    key: const Key('privacy-consent'),
                    value: _acceptedPrivacy,
                    enabled: !state.isSubmitting,
                    label: 'I accept the Privacy Policy.',
                    linkLabel: 'Read Privacy Policy',
                    error: errors.privacy,
                    onChanged: (value) =>
                        setState(() => _acceptedPrivacy = value),
                    onOpen:
                        widget.onOpenPrivacy ??
                        () => _openLegalUrl(_privacyUrl, 'Privacy Policy'),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  FeastaPrimaryButton(
                    key: const Key('create-customer-account'),
                    label: 'Create account',
                    loadingLabel: 'Creating account',
                    isLoading: state.isSubmitting,
                    onPressed: state.isSubmitting ? null : _submit,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  FeastaTextButton(
                    label: 'Already have an account? Sign in',
                    onPressed: state.isSubmitting
                        ? null
                        : () => Navigator.pushReplacement(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const LoginScreen(),
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

class _ConsentControl extends StatelessWidget {
  const _ConsentControl({
    required this.value,
    required this.enabled,
    required this.label,
    required this.linkLabel,
    required this.error,
    required this.onChanged,
    required this.onOpen,
    super.key,
  });

  final bool value;
  final bool enabled;
  final String label;
  final String linkLabel;
  final String? error;
  final ValueChanged<bool> onChanged;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      liveRegion: error != null,
      hint: error == null ? null : 'Error: $error',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: value,
            onChanged: enabled ? (next) => onChanged(next ?? false) : null,
            title: Text(label),
          ),
          Padding(
            padding: const EdgeInsets.only(left: AppSpacing.huge),
            child: FeastaTextButton(
              label: linkLabel,
              onPressed: enabled ? onOpen : null,
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(
                left: AppSpacing.huge,
                top: AppSpacing.xxs,
              ),
              child: Text(error!, style: AppTypography.error),
            ),
        ],
      ),
    );
  }
}
