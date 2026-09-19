import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../../shared/models/feasta_models.dart';
import '../../../authentication/data/repositories/feasta_repository.dart';
import '../application/customer_account_controller.dart';
import '../data/firebase_customer_account_repository.dart';
import '../domain/customer_account_management.dart';

class CustomerAccountManagementScreen extends StatefulWidget {
  const CustomerAccountManagementScreen({
    this.controller,
    this.repository,
    this.accountLoader,
    super.key,
  });

  final CustomerAccountController? controller;
  final FeastaRepository? repository;
  final Future<(UserModel, CustomerModel)> Function()? accountLoader;

  @override
  State<CustomerAccountManagementScreen> createState() =>
      _CustomerAccountManagementScreenState();
}

class _CustomerAccountManagementScreenState
    extends State<CustomerAccountManagementScreen> {
  late final CustomerAccountController controller =
      widget.controller ??
      CustomerAccountController(FirebaseCustomerAccountRepository());
  late final FeastaRepository repository =
      widget.repository ?? FeastaRepository();
  final formKey = GlobalKey<FormState>();
  final firstName = TextEditingController();
  final lastName = TextEditingController();
  final address = TextEditingController();
  final city = TextEditingController();
  final province = TextEditingController();
  late Future<(UserModel, CustomerModel)> accountFuture;
  bool marketingConsent = false;
  bool pushNotifications = true;
  bool emailNotifications = true;

  @override
  void initState() {
    super.initState();
    controller.addListener(_refreshController);
    accountFuture = _loadAccount();
  }

  Future<(UserModel, CustomerModel)> _loadAccount() async {
    if (widget.accountLoader != null) {
      final account = await widget.accountLoader!();
      _populateFields(account.$1, account.$2);
      return account;
    }
    final user = await repository.currentUserData().first;
    if (user == null) throw StateError('Customer account profile is missing.');
    final customer = await repository.getCurrentCustomer();
    _populateFields(user, customer);
    return (user, customer);
  }

  void _populateFields(UserModel user, CustomerModel customer) {
    firstName.text = customer.firstName;
    lastName.text = customer.lastName;
    address.text = customer.address;
    city.text = customer.city;
    province.text = customer.province;
    marketingConsent = user.marketingConsent;
    pushNotifications = user.pushNotificationsEnabled;
    emailNotifications = user.emailNotificationsEnabled;
  }

  void _refreshController() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    controller.removeListener(_refreshController);
    if (widget.controller == null) controller.dispose();
    firstName.dispose();
    lastName.dispose();
    address.dispose();
    city.dispose();
    province.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    if (!(formKey.currentState?.validate() ?? false)) return;
    final success = await controller.updateProfile(
      CustomerProfileUpdate(
        firstName: firstName.text,
        lastName: lastName.text,
        address: address.text,
        city: city.text,
        province: province.text,
      ),
    );
    if (!mounted) return;
    _showResult(success, 'Profile updated.');
  }

  Future<void> _savePreferences() async {
    final success = await controller.updatePreferences(
      CustomerPrivacyPreferences(
        marketingConsent: marketingConsent,
        pushNotificationsEnabled: pushNotifications,
        emailNotificationsEnabled: emailNotifications,
      ),
    );
    if (!mounted) return;
    _showResult(success, 'Privacy and notification preferences updated.');
  }

  void _showResult(bool success, String message) {
    FeastaSnackbars.show(
      context,
      message: success ? message : controller.errorMessage ?? 'Try again.',
      tone: success ? FeastaSnackbarTone.success : FeastaSnackbarTone.error,
    );
  }

  Future<void> _changePassword() async {
    if (!controller.supportsPasswordChanges) {
      _showResult(
        false,
        const CustomerAccountException(
          CustomerAccountFailureKind.passwordProviderRequired,
        ).friendlyMessage,
      );
      return;
    }
    final values = await _showCredentialDialog(
      title: 'Change password',
      includeNewPassword: true,
    );
    if (values == null) return;
    final success = await controller.changePassword(
      currentPassword: values.$1,
      newPassword: values.$2,
    );
    if (!mounted) return;
    _showResult(success, 'Password changed successfully.');
  }

  Future<void> _updateEmail() async {
    if (!controller.supportsPasswordChanges) {
      _showResult(false, 'Google manages the email for this account.');
      return;
    }
    final values = await _showCredentialDialog(
      title: 'Update email',
      includeEmail: true,
    );
    if (values == null) return;
    final success = await controller.requestEmailUpdate(
      currentPassword: values.$1,
      newEmail: values.$2,
    );
    if (!mounted) return;
    _showResult(
      success,
      'Verification sent. Your current email stays active until confirmed.',
    );
  }

  Future<(String, String)?> _showCredentialDialog({
    required String title,
    bool includeEmail = false,
    bool includeNewPassword = false,
  }) async {
    final current = TextEditingController();
    final value = TextEditingController();
    final key = GlobalKey<FormState>();
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Form(
          key: key,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                FeastaTextField(
                  label: 'Current password',
                  controller: current,
                  isPassword: true,
                  isRequired: true,
                  autofillHints: const [AutofillHints.password],
                  validator: _required,
                ),
                const SizedBox(height: AppSpacing.md),
                FeastaTextField(
                  label: includeEmail ? 'New email' : 'New password',
                  controller: value,
                  isPassword: includeNewPassword,
                  isRequired: true,
                  keyboardType: includeEmail
                      ? TextInputType.emailAddress
                      : TextInputType.visiblePassword,
                  autofillHints: [
                    includeEmail
                        ? AutofillHints.newUsername
                        : AutofillHints.newPassword,
                  ],
                  validator: (input) {
                    if (input == null || input.trim().isEmpty) {
                      return 'This field is required.';
                    }
                    if (includeEmail && !input.contains('@')) {
                      return 'Enter a valid email address.';
                    }
                    if (includeNewPassword && input.length < 8) {
                      return 'Use at least 8 characters.';
                    }
                    return null;
                  },
                ),
              ],
            ),
          ),
        ),
        actions: [
          FeastaTextButton(
            label: 'Cancel',
            onPressed: () => Navigator.pop(dialogContext),
          ),
          FeastaPrimaryButton(
            label: 'Continue',
            width: FeastaButtonWidth.intrinsic,
            onPressed: () {
              if (key.currentState?.validate() ?? false) {
                Navigator.pop(dialogContext, (current.text, value.text));
              }
            },
          ),
        ],
      ),
    );
    current.dispose();
    value.dispose();
    return result;
  }

  Future<String?> _requestCurrentPassword(String title) async {
    if (!controller.supportsPasswordChanges) return null;
    final password = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: FeastaTextField(
          label: 'Current password',
          controller: password,
          isPassword: true,
          isRequired: true,
          autofillHints: const [AutofillHints.password],
        ),
        actions: [
          FeastaTextButton(
            label: 'Cancel',
            onPressed: () => Navigator.pop(dialogContext),
          ),
          FeastaPrimaryButton(
            label: 'Confirm identity',
            width: FeastaButtonWidth.intrinsic,
            onPressed: () {
              if (password.text.isNotEmpty) {
                Navigator.pop(dialogContext, password.text);
              }
            },
          ),
        ],
      ),
    );
    password.dispose();
    return result;
  }

  Future<void> _logoutAll() async {
    final confirmed = await showFeastaConfirmationDialog(
      context: context,
      title: 'Log out all sessions?',
      message:
          'Every FEASTA session for this account will need to sign in again.',
      confirmLabel: 'Log out all',
      isDestructive: true,
    );
    if (confirmed != true || !mounted) return;
    final password = await _requestCurrentPassword('Confirm your identity');
    if (controller.supportsPasswordChanges && password == null) return;
    final success = await controller.revokeAllSessions(
      currentPassword: password,
    );
    if (!mounted) return;
    if (!success) _showResult(false, '');
    if (success) Navigator.of(context).popUntil((route) => route.isFirst);
  }

  Future<void> _deactivate() async {
    final confirmed = await showFeastaConfirmationDialog(
      context: context,
      title: 'Deactivate account?',
      message:
          'Your account will be disabled without deleting bookings, payments, disputes, or audit history. Contact FEASTA support to request reactivation.',
      confirmLabel: 'Deactivate',
      isDestructive: true,
    );
    if (confirmed != true || !mounted) return;
    final password = await _requestCurrentPassword('Confirm your identity');
    if (controller.supportsPasswordChanges && password == null) return;
    final success = await controller.deactivate(
      currentPassword: password,
      reason: 'customer_requested',
    );
    if (!mounted) return;
    if (!success) _showResult(false, '');
    if (success) Navigator.of(context).popUntil((route) => route.isFirst);
  }

  String? _required(String? value) =>
      value == null || value.trim().isEmpty ? 'This field is required.' : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Account management')),
      body: FutureBuilder<(UserModel, CustomerModel)>(
        future: accountFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const FeastaFullPageLoading(label: 'Loading account');
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return FeastaErrorState(
              title: 'Could not load your account',
              message: 'Check your connection and try again.',
              onRetry: () => setState(() => accountFuture = _loadAccount()),
            );
          }
          final user = snapshot.data!.$1;
          if (user.isBlocked || user.accountStatus != 'active') {
            return const FeastaErrorState(
              title: 'Account unavailable',
              message: 'Contact FEASTA support for help with this account.',
            );
          }
          return FeastaContentContainer(
            child: ListView(
              children: [
                _Section(
                  title: 'Profile',
                  description:
                      'Only personal profile fields can be changed here.',
                  child: Form(
                    key: formKey,
                    child: Column(
                      children: [
                        FeastaTextField(
                          label: 'First name',
                          controller: firstName,
                          isRequired: true,
                          validator: _required,
                          autofillHints: const [AutofillHints.givenName],
                        ),
                        const SizedBox(height: AppSpacing.md),
                        FeastaTextField(
                          label: 'Last name',
                          controller: lastName,
                          isRequired: true,
                          validator: _required,
                          autofillHints: const [AutofillHints.familyName],
                        ),
                        const SizedBox(height: AppSpacing.md),
                        FeastaTextField(
                          label: 'Address',
                          controller: address,
                          maxLines: 2,
                          autofillHints: const [
                            AutofillHints.streetAddressLine1,
                          ],
                        ),
                        const SizedBox(height: AppSpacing.md),
                        FeastaTextField(label: 'City', controller: city),
                        const SizedBox(height: AppSpacing.md),
                        FeastaTextField(
                          label: 'Province',
                          controller: province,
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        FeastaPrimaryButton(
                          label: 'Save profile',
                          onPressed: _saveProfile,
                          isLoading: controller.isSubmitting,
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          'Phone verification and profile photo uploads use their dedicated secure workflows.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
                _Section(
                  title: 'Privacy and consent',
                  description:
                      'Policy wording and versions are managed by FEASTA. These controls record your current preferences.',
                  child: Column(
                    children: [
                      SwitchListTile(
                        title: const Text('Marketing messages'),
                        subtitle: const Text(
                          'Receive FEASTA offers and updates.',
                        ),
                        value: marketingConsent,
                        onChanged: controller.isSubmitting
                            ? null
                            : (value) =>
                                  setState(() => marketingConsent = value),
                      ),
                      SwitchListTile(
                        title: const Text('Push notifications'),
                        value: pushNotifications,
                        onChanged: controller.isSubmitting
                            ? null
                            : (value) =>
                                  setState(() => pushNotifications = value),
                      ),
                      SwitchListTile(
                        title: const Text('Email notifications'),
                        value: emailNotifications,
                        onChanged: controller.isSubmitting
                            ? null
                            : (value) =>
                                  setState(() => emailNotifications = value),
                      ),
                      FeastaSecondaryButton(
                        label: 'Save preferences',
                        onPressed: _savePreferences,
                        isLoading: controller.isSubmitting,
                      ),
                    ],
                  ),
                ),
                _Section(
                  title: 'Security',
                  child: Column(
                    children: [
                      FeastaSecondaryButton(
                        label: 'Change password',
                        onPressed: _changePassword,
                        icon: const Icon(Icons.password_outlined),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      FeastaSecondaryButton(
                        label: 'Update email',
                        onPressed: _updateEmail,
                        icon: const Icon(Icons.alternate_email),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      FeastaSecondaryButton(
                        label: 'Log out all sessions',
                        onPressed: _logoutAll,
                        icon: const Icon(Icons.logout),
                      ),
                    ],
                  ),
                ),
                _Section(
                  title: 'Account lifecycle',
                  description:
                      'Deactivation is reversible only through FEASTA support and does not erase retained records.',
                  child: FeastaDestructiveButton(
                    label: 'Deactivate account',
                    onPressed: _deactivate,
                    isLoading: controller.isSubmitting,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.description});

  final String title;
  final String? description;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            if (description != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                description!,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.secondaryText,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            child,
          ],
        ),
      ),
    );
  }
}
