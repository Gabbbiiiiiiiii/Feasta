import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_breakpoints.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';
import '../../authentication/application/customer_auth_scope.dart';
import '../../authentication/application/customer_login_controller.dart';
import '../../authentication/application/customer_registration_controller.dart';
import '../../authentication/data/repositories/auth_repository.dart';
import '../../authentication/domain/customer_login.dart';
import '../../authentication/domain/customer_registration.dart';
import '../widgets/feasta_google_auth_button.dart';
import 'email_verification_screen.dart';
import 'login_screen.dart';

class CustomerRegisterScreen extends StatefulWidget {
  const CustomerRegisterScreen({
    this.registrationGateway,
    this.googleLoginGateway,
    this.onRegistrationComplete,
    this.onOpenTerms,
    this.onOpenPrivacy,
    super.key,
  });

  final CustomerRegistrationGateway? registrationGateway;
  final CustomerLoginGateway? googleLoginGateway;

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

  late final CustomerRegistrationController _registrationController;
  late final CustomerLoginController _googleController;

  bool _acceptedTerms = false;
  bool _acceptedPrivacy = false;

  bool get _isSubmitting =>
      _registrationController.state.isSubmitting ||
      _googleController.state.isSubmitting;

  @override
  void initState() {
    super.initState();

    //
    // Only construct Firebase-backed AuthRepository when at least one
    // production dependency is actually required.
    //
    // Widget tests can provide both gateways and therefore never touch
    // FirebaseAuth.instance.
    //
    final needsProductionRepository =
        widget.registrationGateway == null || widget.googleLoginGateway == null;

    final AuthRepository? authRepository = needsProductionRepository
        ? AuthRepository()
        : null;

    _registrationController = CustomerRegistrationController(
      gateway: widget.registrationGateway ?? authRepository!,
    )..addListener(_handleStateChanged);

    _googleController = CustomerLoginController(
      gateway: widget.googleLoginGateway ?? authRepository!,
    )..addListener(_handleStateChanged);
  }

  void _handleStateChanged() {
    if (!mounted) return;

    setState(() {});
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;

    FocusScope.of(context).unfocus();

    final result = await _registrationController.submit(
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

    if (gateController != null) {
      await gateController.refresh();
    }

    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => EmailVerificationScreen(
          email: result.email,
          managedByAuthenticationGate: gateController != null,
          initialNotice: result.verificationEmailSent
              ? null
              : 'Your account was created, but the verification '
                    'email could not be sent. Use Resend verification '
                    'on this screen.',
        ),
      ),
      (_) => false,
    );
  }

  Future<void> _continueWithGoogle() async {
    if (_isSubmitting) return;

    FocusScope.of(context).unfocus();

    final result = await _googleController.signInWithGoogle();

    if (!mounted || result == null) return;

    final gateController = CustomerAuthenticationScope.maybeOf(context);

    if (gateController != null) {
      await gateController.refresh();

      if (!mounted) return;

      //
      // Registration is normally opened above the authentication gate.
      // Returning from this screen lets the gate display the newly
      // authenticated customer state.
      //
      Navigator.maybePop(context);
      return;
    }

    //
    // When this screen is used outside the managed authentication gate,
    // return to login rather than leaving a duplicate registration route
    // in the navigation stack.
    //
    if (!mounted) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  Future<void> _openLegalUrl(String configuredUrl, String label) async {
    final uri = Uri.tryParse(configuredUrl.trim());

    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
      if (!mounted) return;

      FeastaSnackbars.show(
        context,
        message:
            '$label is temporarily unavailable. '
            'Please try again later.',
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

  void _openLogin() {
    if (_isSubmitting) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  void dispose() {
    _registrationController
      ..removeListener(_handleStateChanged)
      ..dispose();

    _googleController
      ..removeListener(_handleStateChanged)
      ..dispose();

    _firstNameController.dispose();
    _lastNameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();

    _firstNameFocus.dispose();
    _lastNameFocus.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    _confirmPasswordFocus.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final registrationState = _registrationController.state;

    final googleState = _googleController.state;

    final errors = registrationState.errors;

    final generalError =
        registrationState.generalError ?? googleState.generalError;

    final notice = googleState.notice;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          tooltip: 'Close registration',
          onPressed: _isSubmitting ? null : () => Navigator.maybePop(context),
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
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Join FEASTA',
                    style: AppTypography.headline.copyWith(
                      color: AppColors.mainText,
                    ),
                  ),

                  const SizedBox(height: AppSpacing.xs),

                  Text(
                    'Create a customer account to plan and book your event.',
                    style: AppTypography.body.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),

                  const SizedBox(height: AppSpacing.xl),

                  if (generalError != null) ...[
                    _RegistrationMessage(message: generalError, isError: true),
                    const SizedBox(height: AppSpacing.md),
                  ],

                  if (notice != null) ...[
                    _RegistrationMessage(message: notice, isError: false),
                    const SizedBox(height: AppSpacing.md),
                  ],

                  LayoutBuilder(
                    builder: (context, constraints) {
                      final shouldStack =
                          constraints.maxWidth < AppBreakpoints.tablet ||
                          MediaQuery.textScalerOf(context).scale(1) > 1.3;

                      final firstNameField = FeastaTextField(
                        label: 'First name',
                        controller: _firstNameController,
                        focusNode: _firstNameFocus,
                        nextFocusNode: _lastNameFocus,
                        errorText: errors.firstName,
                        isRequired: true,
                        enabled: !_isSubmitting,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.givenName],
                        maxLength: 80,
                      );

                      final lastNameField = FeastaTextField(
                        label: 'Last name',
                        controller: _lastNameController,
                        focusNode: _lastNameFocus,
                        nextFocusNode: _emailFocus,
                        errorText: errors.lastName,
                        isRequired: true,
                        enabled: !_isSubmitting,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.familyName],
                        maxLength: 80,
                      );

                      if (shouldStack) {
                        return Column(
                          children: [
                            firstNameField,
                            const SizedBox(height: AppSpacing.md),
                            lastNameField,
                          ],
                        );
                      }

                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: firstNameField),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(child: lastNameField),
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
                    enabled: !_isSubmitting,
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
                    enabled: !_isSubmitting,
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
                    enabled: !_isSubmitting,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.newPassword],
                    onSubmitted: (_) => _submit(),
                  ),

                  const SizedBox(height: AppSpacing.lg),

                  _ConsentControl(
                    key: const Key('terms-consent'),
                    value: _acceptedTerms,
                    enabled: !_isSubmitting,
                    label: 'I accept the Terms of Service.',
                    linkLabel: 'Read Terms of Service',
                    error: errors.terms,
                    onChanged: (value) {
                      setState(() {
                        _acceptedTerms = value;
                      });
                    },
                    onOpen:
                        widget.onOpenTerms ??
                        () => _openLegalUrl(_termsUrl, 'Terms of Service'),
                  ),

                  const SizedBox(height: AppSpacing.sm),

                  _ConsentControl(
                    key: const Key('privacy-consent'),
                    value: _acceptedPrivacy,
                    enabled: !_isSubmitting,
                    label: 'I accept the Privacy Policy.',
                    linkLabel: 'Read Privacy Policy',
                    error: errors.privacy,
                    onChanged: (value) {
                      setState(() {
                        _acceptedPrivacy = value;
                      });
                    },
                    onOpen:
                        widget.onOpenPrivacy ??
                        () => _openLegalUrl(_privacyUrl, 'Privacy Policy'),
                  ),

                  const SizedBox(height: AppSpacing.xl),

                  FeastaPrimaryButton(
                    key: const Key('create-customer-account'),
                    label: 'Create account',
                    loadingLabel: 'Creating account',
                    isLoading: registrationState.isSubmitting,
                    onPressed: _isSubmitting ? null : _submit,
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
                    key: const Key('google-register-button'),
                    isLoading: googleState.isSubmitting,
                    onPressed: _isSubmitting ? null : _continueWithGoogle,
                  ),

                  const SizedBox(height: AppSpacing.xl),

                  Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        'Already have an account?',
                        style: AppTypography.body.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                      FeastaTextButton(
                        label: 'Sign in',
                        onPressed: _isSubmitting ? null : _openLogin,
                      ),
                    ],
                  ),

                  const SizedBox(height: AppSpacing.xxl),
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
            onChanged: enabled
                ? (next) {
                    onChanged(next ?? false);
                  }
                : null,
            activeColor: AppColors.primary,
            title: Text(
              label,
              style: AppTypography.body.copyWith(color: AppColors.mainText),
            ),
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

class _RegistrationMessage extends StatelessWidget {
  const _RegistrationMessage({required this.message, required this.isError});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final color = isError ? AppColors.error : AppColors.info;

    final backgroundColor = isError
        ? AppColors.errorSubtle
        : AppColors.infoSubtle;

    return Semantics(
      container: true,
      liveRegion: true,
      label:
          '${isError ? 'Account creation error' : 'Account creation status'}: '
          '$message',
      child: Container(
        key: isError ? const Key('registration-error-summary') : null,
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: backgroundColor,
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              isError
                  ? Icons.error_outline_rounded
                  : Icons.info_outline_rounded,
              color: color,
              size: 22,
            ),

            const SizedBox(width: AppSpacing.sm),

            Expanded(
              child: Text(
                message,
                style: AppTypography.body.copyWith(color: color),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
