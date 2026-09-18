import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radius.dart';
import '../../../../core/theme/app_shadows.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../../shared/models/customer_profile_preferences.dart';
import '../../../../shared/models/feasta_models.dart';
import '../../../authentication/data/repositories/feasta_repository.dart';
import '../../phone_verification_screen.dart';
import '../application/customer_account_controller.dart';
import '../data/firebase_customer_account_repository.dart';
import '../data/customer_profile_photo_service.dart';
import '../domain/customer_account_management.dart';

class CustomerAccountManagementScreen extends StatefulWidget {
  const CustomerAccountManagementScreen({
    this.controller,
    this.repository,
    this.accountLoader,
    this.profilePhotoService,
    super.key,
  });

  final CustomerAccountController? controller;
  final FeastaRepository? repository;
  final Future<(UserModel, CustomerModel)> Function()? accountLoader;

  final CustomerProfilePhotoService? profilePhotoService;
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

  final CustomerProfilePreferencesService _profilePreferencesService =
      CustomerProfilePreferencesService();

  CustomerProfilePhotoService? _profilePhotoService;

  CustomerProfilePhotoService get profilePhotoService =>
      _profilePhotoService ??=
          widget.profilePhotoService ?? CustomerProfilePhotoService();
  final ImagePicker _imagePicker = ImagePicker();
  final ImageCropper _imageCropper = ImageCropper();

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();

  bool _photoFlowActive = false;
  bool _photoUploading = false;
  bool _profileImageOverrideSet = false;
  String? _profileImageUrlOverride;

  final TextEditingController _firstNameController = TextEditingController();
  final TextEditingController _lastNameController = TextEditingController();
  final TextEditingController _streetAddressController =
      TextEditingController();
  final TextEditingController _barangayController = TextEditingController();
  final TextEditingController _cityController = TextEditingController();
  final TextEditingController _provinceController = TextEditingController();
  final TextEditingController _postalCodeController = TextEditingController();

  late Future<(UserModel, CustomerModel)> _accountFuture;

  CustomerPreferredContactMethod _preferredContactMethod =
      CustomerPreferredContactMethod.inAppMessage;

  bool _useAsDefaultEventLocation = false;

  @override
  void initState() {
    super.initState();
    controller.addListener(_refreshController);
    _accountFuture = _loadAccount();
  }

  @override
  void dispose() {
    controller.removeListener(_refreshController);

    if (widget.controller == null) {
      controller.dispose();
    }

    _firstNameController.dispose();
    _lastNameController.dispose();
    _streetAddressController.dispose();
    _barangayController.dispose();
    _cityController.dispose();
    _provinceController.dispose();
    _postalCodeController.dispose();

    super.dispose();
  }

  Future<(UserModel, CustomerModel)> _loadAccount() async {
    final account = widget.accountLoader != null
        ? await widget.accountLoader!()
        : await _loadAccountFromRepository();

    await _populateFields(account.$1, account.$2);

    return account;
  }

  Future<(UserModel, CustomerModel)> _loadAccountFromRepository() async {
    final user = await repository.currentUserData().first;

    if (user == null) {
      throw StateError('Customer account profile is missing.');
    }

    final customer = await repository.getCurrentCustomer();

    return (user, customer);
  }

  Future<void> _populateFields(UserModel user, CustomerModel customer) async {
    _firstNameController.text = customer.firstName;
    _lastNameController.text = customer.lastName;

    final preferences = await _profilePreferencesService.load();

    _streetAddressController.text = preferences.streetAddress.trim().isNotEmpty
        ? preferences.streetAddress
        : customer.address;

    _barangayController.text = preferences.barangay;

    _cityController.text = preferences.city.trim().isNotEmpty
        ? preferences.city
        : customer.city;

    _provinceController.text = preferences.province.trim().isNotEmpty
        ? preferences.province
        : customer.province;

    _postalCodeController.text = preferences.postalCode;

    _preferredContactMethod = preferences.preferredContactMethod;
    _useAsDefaultEventLocation = preferences.useAsDefaultEventLocation;
  }

  void _refreshController() {
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _reload() async {
    setState(() {
      _accountFuture = _loadAccount();
    });

    await _accountFuture;
  }

  String? _required(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'This field is required.';
    }

    return null;
  }

  String? _postalCodeValidator(String? value) {
    final text = value?.trim() ?? '';

    if (text.isEmpty) {
      return null;
    }

    if (!RegExp(r'^\d{4}$').hasMatch(text)) {
      return 'Enter a valid 4-digit postal code.';
    }

    return null;
  }

  String get _combinedAddress {
    return <String>[
      _streetAddressController.text.trim(),
      _barangayController.text.trim(),
      _postalCodeController.text.trim(),
    ].where((part) => part.isNotEmpty).join(', ');
  }

  Future<void> _saveChanges() async {
    FocusScope.of(context).unfocus();

    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    final success = await controller.updateProfile(
      CustomerProfileUpdate(
        firstName: _firstNameController.text.trim(),
        lastName: _lastNameController.text.trim(),
        address: _combinedAddress,
        city: _cityController.text.trim(),
        province: _provinceController.text.trim(),
      ),
    );

    if (!success || !mounted) {
      _showSaveError(
        controller.errorMessage ?? 'Unable to save changes. Please try again.',
      );
      return;
    }

    try {
      await _profilePreferencesService.save(
        CustomerProfilePreferences(
          streetAddress: _streetAddressController.text.trim(),
          barangay: _barangayController.text.trim(),
          city: _cityController.text.trim(),
          province: _provinceController.text.trim(),
          postalCode: _postalCodeController.text.trim(),
          preferredContactMethod: _preferredContactMethod,
          useAsDefaultEventLocation: _useAsDefaultEventLocation,
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }

      _showSaveError('Unable to save changes. Please try again.');
      return;
    }

    if (!mounted) {
      return;
    }

    _showSaveSuccess();
  }

  void _showSaveSuccess() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 3),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.primary,
          margin: EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.sm,
            AppSpacing.screen,
            MediaQuery.paddingOf(context).bottom + AppSpacing.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.large),
          ),
          elevation: 8,
          content: Row(
            children: [
              const Icon(Icons.check_circle_rounded, color: Colors.white),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  'Profile updated successfully',
                  style: AppTypography.label.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
  }

  void _showSaveError(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 3),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.error,
          margin: EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.sm,
            AppSpacing.screen,
            MediaQuery.paddingOf(context).bottom + AppSpacing.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.large),
          ),
          elevation: 8,
          content: Row(
            children: [
              const Icon(Icons.error_outline_rounded, color: Colors.white),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  message.trim().isEmpty
                      ? 'Unable to save changes. Please try again.'
                      : message,
                  style: AppTypography.label.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
  }

  void _showUnavailable(String feature) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text('$feature is not enabled for this FEASTA account yet.'),
        ),
      );
  }

  String? _resolveProfileImageUrl(UserModel user, CustomerModel customer) {
    if (_profileImageOverrideSet) {
      final override = _profileImageUrlOverride?.trim();
      return override == null || override.isEmpty ? null : override;
    }

    final customerImage = customer.profileImageUrl?.trim();
    if (customerImage != null && customerImage.isNotEmpty) {
      return customerImage;
    }

    final userImage = user.profileImageUrl?.trim();
    if (userImage != null && userImage.isNotEmpty) {
      return userImage;
    }

    return null;
  }

  Future<void> _openProfilePhotoActions(
    UserModel user,
    CustomerModel customer,
  ) async {
    if (_photoFlowActive || controller.isSubmitting) {
      return;
    }

    final currentImageUrl = _resolveProfileImageUrl(user, customer);

    final action = await showModalBottomSheet<_ProfilePhotoAction>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppRadius.large),
        ),
      ),
      builder: (sheetContext) {
        return _ProfilePhotoActionSheet(hasPhoto: currentImageUrl != null);
      },
    );

    if (!mounted || action == null) {
      return;
    }

    switch (action) {
      case _ProfilePhotoAction.camera:
        await _pickCropPreviewAndUpload(
          source: ImageSource.camera,
          previousImageUrl: currentImageUrl,
        );
      case _ProfilePhotoAction.gallery:
        await _pickCropPreviewAndUpload(
          source: ImageSource.gallery,
          previousImageUrl: currentImageUrl,
        );
      case _ProfilePhotoAction.remove:
        await _removeProfilePhoto(currentImageUrl);
    }
  }

  Future<void> _pickCropPreviewAndUpload({
    required ImageSource source,
    required String? previousImageUrl,
  }) async {
    if (_photoFlowActive) {
      return;
    }

    setState(() {
      _photoFlowActive = true;
    });

    try {
      final picked = await _imagePicker.pickImage(
        source: source,
        imageQuality: 95,
        maxWidth: 2400,
        maxHeight: 2400,
      );

      if (picked == null || !mounted) {
        return;
      }

      final cropped = await _imageCropper.cropImage(
        sourcePath: picked.path,
        maxWidth: 1024,
        maxHeight: 1024,
        compressFormat: ImageCompressFormat.jpg,
        compressQuality: 90,
        aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Adjust profile photo',
            toolbarColor: AppColors.background,
            toolbarWidgetColor: AppColors.mainText,
            activeControlsWidgetColor: AppColors.primary,
            backgroundColor: AppColors.background,
            cropStyle: CropStyle.circle,
            lockAspectRatio: true,
            hideBottomControls: true,
            showCropGrid: false,
          ),
          IOSUiSettings(
            title: 'Adjust profile photo',
            doneButtonTitle: 'Preview',
            cancelButtonTitle: 'Cancel',
            cropStyle: CropStyle.circle,
            aspectRatioLockEnabled: true,
            resetAspectRatioEnabled: false,
            aspectRatioPickerButtonHidden: true,
          ),
        ],
      );

      if (cropped == null || !mounted) {
        return;
      }

      final usePhoto = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => _ProfilePhotoPreviewScreen(imagePath: cropped.path),
        ),
      );

      if (usePhoto != true || !mounted) {
        return;
      }

      setState(() {
        _photoUploading = true;
      });

      final newUrl = await profilePhotoService.uploadProfilePhoto(
        imageFile: File(cropped.path),
        previousImageUrl: previousImageUrl,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _profileImageOverrideSet = true;
        _profileImageUrlOverride = newUrl;
      });

      _showSaveSuccessMessage('Profile photo updated successfully');
    } catch (_) {
      if (!mounted) {
        return;
      }

      _showSaveError('Unable to update profile photo. Please try again.');
    } finally {
      if (mounted) {
        setState(() {
          _photoUploading = false;
          _photoFlowActive = false;
        });
      }
    }
  }

  Future<void> _removeProfilePhoto(String? currentImageUrl) async {
    if (_photoFlowActive || currentImageUrl == null) {
      return;
    }

    setState(() {
      _photoFlowActive = true;
      _photoUploading = true;
    });

    try {
      await profilePhotoService.removeProfilePhoto(
        currentImageUrl: currentImageUrl,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _profileImageOverrideSet = true;
        _profileImageUrlOverride = null;
      });

      _showSaveSuccessMessage('Profile photo removed');
    } catch (_) {
      if (!mounted) {
        return;
      }

      _showSaveError('Unable to update profile photo. Please try again.');
    } finally {
      if (mounted) {
        setState(() {
          _photoUploading = false;
          _photoFlowActive = false;
        });
      }
    }
  }

  Future<void> _changePassword() async {
    if (!controller.supportsPasswordChanges) {
      _showSaveError(
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

    if (values == null) {
      return;
    }

    final success = await controller.changePassword(
      currentPassword: values.$1,
      newPassword: values.$2,
    );

    if (!mounted) {
      return;
    }

    if (success) {
      _showSaveSuccessMessage('Password changed successfully');
    } else {
      _showSaveError(
        controller.errorMessage ??
            'Unable to change password. Please try again.',
      );
    }
  }

  Future<void> _updateEmail() async {
    if (!controller.supportsPasswordChanges) {
      _showSaveError('Google manages the email for this account.');
      return;
    }

    final values = await _showCredentialDialog(
      title: 'Update email',
      includeEmail: true,
    );

    if (values == null) {
      return;
    }

    final success = await controller.requestEmailUpdate(
      currentPassword: values.$1,
      newEmail: values.$2,
    );

    if (!mounted) {
      return;
    }

    if (success) {
      _showSaveSuccessMessage('Verification sent to your new email');
    } else {
      _showSaveError(
        controller.errorMessage ?? 'Unable to update email. Please try again.',
      );
    }
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
                    final text = input?.trim() ?? '';

                    if (text.isEmpty) {
                      return 'This field is required.';
                    }

                    if (includeEmail && !text.contains('@')) {
                      return 'Enter a valid email address.';
                    }

                    if (includeNewPassword && text.length < 8) {
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
    if (!controller.supportsPasswordChanges) {
      return null;
    }

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
      title: 'Sign out from all devices?',
      message:
          'Every FEASTA session for this account will need to sign in again.',
      confirmLabel: 'Sign out all',
      isDestructive: true,
    );

    if (confirmed != true || !mounted) {
      return;
    }

    final password = await _requestCurrentPassword('Confirm your identity');

    if (controller.supportsPasswordChanges && password == null) {
      return;
    }

    final success = await controller.revokeAllSessions(
      currentPassword: password,
    );

    if (!mounted) {
      return;
    }

    if (!success) {
      _showSaveError(
        controller.errorMessage ??
            'Unable to sign out all devices. Please try again.',
      );
      return;
    }

    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  void _showSaveSuccessMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 3),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.primary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.large),
          ),
          content: Row(
            children: [
              const Icon(Icons.check_circle_rounded, color: Colors.white),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  message,
                  style: AppTypography.label.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
  }

  Future<void> _showDeleteAccountInfo() async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete account'),
        content: const Text(
          'Permanent account deletion is not enabled by the current '
          'FEASTA backend. Your existing secure account workflow supports '
          'session revocation and account deactivation. Contact FEASTA '
          'support if permanent deletion is required.',
        ),
        actions: [
          FeastaPrimaryButton(
            label: 'Close',
            width: FeastaButtonWidth.intrinsic,
            onPressed: () => Navigator.pop(dialogContext),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.mainText,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text(
          'Account management',
          style: AppTypography.title.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: FutureBuilder<(UserModel, CustomerModel)>(
        future: _accountFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const FeastaFullPageLoading(label: 'Loading account');
          }

          if (snapshot.hasError || !snapshot.hasData) {
            return FeastaErrorState(
              title: 'Could not load your account',
              message: 'Check your connection and try again.',
              onRetry: _reload,
            );
          }

          final user = snapshot.data!.$1;
          final customer = snapshot.data!.$2;

          if (user.isBlocked || user.accountStatus != 'active') {
            return const FeastaErrorState(
              title: 'Account unavailable',
              message: 'Contact FEASTA support for help with this account.',
            );
          }

          return Form(
            key: _formKey,
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screen,
                AppSpacing.sm,
                AppSpacing.screen,
                AppSpacing.xxl,
              ),
              children: [
                _AccountIdentitySummary(
                  user: user,
                  customer: customer,
                  imageUrl: _resolveProfileImageUrl(user, customer),
                ),
                const SizedBox(height: AppSpacing.lg),
                _SectionCard(
                  title: 'Personal information',
                  icon: Icons.person_outline_rounded,
                  child: Column(
                    children: [
                      _ProfilePhotoEditor(
                        imageUrl: _resolveProfileImageUrl(user, customer),
                        isBusy: _photoFlowActive,
                        isUploading: _photoUploading,
                        onPressed: () =>
                            _openProfilePhotoActions(user, customer),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _AccountFormField(
                        label: 'First name',
                        controller: _firstNameController,
                        isRequired: true,
                        validator: _required,
                        autofillHints: const [AutofillHints.givenName],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _AccountFormField(
                        label: 'Last name',
                        controller: _lastNameController,
                        isRequired: true,
                        validator: _required,
                        autofillHints: const [AutofillHints.familyName],
                      ),
                    ],
                  ),
                ),
                _SectionCard(
                  title: 'Contact information',
                  icon: Icons.contact_phone_outlined,
                  child: Column(
                    children: [
                      _ContactStatusRow(
                        icon: Icons.alternate_email_rounded,
                        label: 'Email address',
                        value: user.email,
                        verified: user.isEmailVerified,
                        actionLabel: controller.supportsPasswordChanges
                            ? 'Change'
                            : null,
                        onAction: controller.supportsPasswordChanges
                            ? _updateEmail
                            : null,
                      ),
                      const Divider(
                        height: AppSpacing.xl,
                        color: AppColors.border,
                      ),
                      _ContactStatusRow(
                        icon: Icons.phone_outlined,
                        label: 'Phone number',
                        value: user.phoneNumber.trim().isEmpty
                            ? 'No phone number'
                            : user.phoneNumber,
                        verified: user.isPhoneVerified,
                        actionLabel: user.isPhoneVerified ? null : 'Verify',
                        onAction: user.isPhoneVerified
                            ? null
                            : () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        const PhoneVerificationScreen(),
                                  ),
                                );
                              },
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Preferred contact method',
                          style: AppTypography.label.copyWith(
                            color: AppColors.mainText,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Wrap(
                        spacing: AppSpacing.xs,
                        runSpacing: AppSpacing.xs,
                        children: CustomerPreferredContactMethod.values.map((
                          method,
                        ) {
                          final selected = _preferredContactMethod == method;

                          return ChoiceChip(
                            label: Text(method.label),
                            selected: selected,
                            selectedColor: AppColors.primarySubtle,
                            backgroundColor: AppColors.surface,
                            checkmarkColor: AppColors.primaryStrong,
                            side: BorderSide(
                              color: selected
                                  ? AppColors.primary
                                  : AppColors.border,
                            ),
                            labelStyle: AppTypography.caption.copyWith(
                              color: selected
                                  ? AppColors.primaryStrong
                                  : AppColors.mainText,
                              fontWeight: FontWeight.w800,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(
                                AppRadius.pill,
                              ),
                            ),
                            onSelected: (_) {
                              setState(() {
                                _preferredContactMethod = method;
                              });
                            },
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                ),
                _SectionCard(
                  title: 'Default address',
                  icon: Icons.location_on_outlined,
                  description:
                      'Stable address information only. Event-specific '
                      'venue details are still chosen in Plan Your Event.',
                  child: Column(
                    children: [
                      _AccountFormField(
                        label: 'Street address',
                        controller: _streetAddressController,
                        isRequired: true,
                        validator: _required,
                        autofillHints: const [AutofillHints.streetAddressLine1],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _AccountFormField(
                        label: 'Barangay',
                        controller: _barangayController,
                        isRequired: true,
                        validator: _required,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _AccountFormField(
                        label: 'City or municipality',
                        controller: _cityController,
                        isRequired: true,
                        validator: _required,
                        autofillHints: const [AutofillHints.addressCity],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _AccountFormField(
                        label: 'Province',
                        controller: _provinceController,
                        isRequired: true,
                        validator: _required,
                        autofillHints: const [AutofillHints.addressState],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _AccountFormField(
                        label: 'Postal code',
                        controller: _postalCodeController,
                        validator: _postalCodeValidator,
                        keyboardType: TextInputType.number,
                        autofillHints: const [AutofillHints.postalCode],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        activeColor: AppColors.primary,
                        checkColor: Colors.white,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: _useAsDefaultEventLocation,
                        title: Text(
                          'Use this as my default event location',
                          style: AppTypography.label.copyWith(
                            color: AppColors.mainText,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        subtitle: Text(
                          'Prefill this address in Plan Your Event. '
                          'You can still change the venue for each event.',
                          style: AppTypography.caption.copyWith(
                            color: AppColors.secondaryTextAccessible,
                            height: 1.35,
                          ),
                        ),
                        onChanged: controller.isSubmitting
                            ? null
                            : (value) {
                                setState(() {
                                  _useAsDefaultEventLocation = value ?? false;
                                });
                              },
                      ),
                    ],
                  ),
                ),
                _SectionCard(
                  title: 'Security and account',
                  icon: Icons.shield_outlined,
                  child: Column(
                    children: [
                      _SecurityRow(
                        icon: Icons.password_outlined,
                        title: 'Change password',
                        subtitle: controller.supportsPasswordChanges
                            ? 'Update your FEASTA password'
                            : 'Managed by your sign-in provider',
                        onTap: _changePassword,
                      ),
                      const Divider(height: 1, color: AppColors.border),
                      _SecurityRow(
                        icon: Icons.phonelink_lock_outlined,
                        title: 'Two-factor authentication',
                        subtitle: 'Add another layer of account security',
                        onTap: () =>
                            _showUnavailable('Two-factor authentication'),
                      ),
                      const Divider(height: 1, color: AppColors.border),
                      _SecurityRow(
                        icon: Icons.devices_outlined,
                        title: 'Active sessions',
                        subtitle: 'Review devices signed in to your account',
                        onTap: () => _showUnavailable('Active sessions'),
                      ),
                      const Divider(height: 1, color: AppColors.border),
                      _SecurityRow(
                        icon: Icons.logout_rounded,
                        title: 'Sign out from all devices',
                        subtitle: 'Revoke all current FEASTA sessions',
                        onTap: _logoutAll,
                      ),
                      const Divider(height: 1, color: AppColors.border),
                      _SecurityRow(
                        icon: Icons.delete_outline_rounded,
                        title: 'Delete account',
                        subtitle:
                            'Permanent deletion requires the secure '
                            'FEASTA deletion workflow',
                        destructive: true,
                        onTap: _showDeleteAccountInfo,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                FeastaPrimaryButton(
                  label: 'Save changes',
                  icon: const Icon(Icons.save_outlined),
                  onPressed: _saveChanges,
                  isLoading: controller.isSubmitting,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Email and phone verification continue to use their '
                  'existing secure workflows. Event preferences such as '
                  'event type, theme, guest count, budget, and dietary '
                  'requirements remain in Plan Your Event.',
                  textAlign: TextAlign.center,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.4,
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

class _AccountIdentitySummary extends StatelessWidget {
  const _AccountIdentitySummary({
    required this.user,
    required this.customer,
    required this.imageUrl,
  });

  final UserModel user;
  final CustomerModel customer;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final name = customer.fullName.trim().isNotEmpty
        ? customer.fullName.trim()
        : user.fullName.trim();

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
        boxShadow: AppShadows.card,
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: AppColors.primarySubtle,
            backgroundImage: imageUrl?.trim().isNotEmpty == true
                ? NetworkImage(imageUrl!)
                : null,
            child: imageUrl?.trim().isNotEmpty == true
                ? null
                : const Icon(
                    Icons.person_rounded,
                    color: AppColors.primary,
                    size: 30,
                  ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name.isEmpty ? 'FEASTA customer' : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  user.email,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

enum _ProfilePhotoAction { camera, gallery, remove }

class _ProfilePhotoEditor extends StatelessWidget {
  const _ProfilePhotoEditor({
    required this.imageUrl,
    required this.isBusy,
    required this.isUploading,
    required this.onPressed,
  });

  final String? imageUrl;
  final bool isBusy;
  final bool isUploading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Semantics(
        button: true,
        enabled: !isBusy,
        label: 'Change profile photo',
        child: SizedBox(
          width: 116,
          height: 116,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: Material(
                  color: AppColors.primarySubtle,
                  shape: const CircleBorder(),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: isBusy ? null : onPressed,
                    customBorder: const CircleBorder(),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (imageUrl != null)
                          Image.network(
                            imageUrl!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, _, _) => const Icon(
                              Icons.person_outline_rounded,
                              color: AppColors.primary,
                              size: 42,
                            ),
                          )
                        else
                          const Icon(
                            Icons.person_outline_rounded,
                            color: AppColors.primary,
                            size: 42,
                          ),
                        if (isUploading)
                          ColoredBox(
                            color: Colors.black.withValues(alpha: 0.20),
                            child: const Center(
                              child: SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.6,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                right: -2,
                bottom: -2,
                child: Semantics(
                  button: true,
                  enabled: !isBusy,
                  label: 'Change profile photo',
                  child: Material(
                    color: AppColors.primary,
                    shape: const CircleBorder(),
                    elevation: 3,
                    shadowColor: AppColors.primary.withValues(alpha: 0.28),
                    child: InkWell(
                      onTap: isBusy ? null : onPressed,
                      customBorder: const CircleBorder(),
                      child: const SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(
                          Icons.photo_camera_outlined,
                          color: Colors.white,
                          size: 21,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfilePhotoActionSheet extends StatelessWidget {
  const _ProfilePhotoActionSheet({required this.hasPhoto});

  final bool hasPhoto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.xs,
        AppSpacing.screen,
        MediaQuery.paddingOf(context).bottom + AppSpacing.md,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Profile photo',
            style: AppTypography.sectionTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          _PhotoSheetAction(
            icon: Icons.photo_camera_outlined,
            label: 'Take a photo',
            onTap: () => Navigator.pop(context, _ProfilePhotoAction.camera),
          ),
          _PhotoSheetAction(
            icon: Icons.photo_library_outlined,
            label: 'Choose from gallery',
            onTap: () => Navigator.pop(context, _ProfilePhotoAction.gallery),
          ),
          if (hasPhoto)
            _PhotoSheetAction(
              icon: Icons.delete_outline_rounded,
              label: 'Remove current photo',
              destructive: true,
              onTap: () => Navigator.pop(context, _ProfilePhotoAction.remove),
            ),
          const SizedBox(height: AppSpacing.xs),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: () => Navigator.pop(context),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.mainText,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Cancel'),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoSheetAction extends StatelessWidget {
  const _PhotoSheetAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final foreground = destructive ? AppColors.error : AppColors.mainText;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.medium),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: destructive
                      ? AppColors.errorSubtle
                      : AppColors.primarySubtle,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: Icon(
                  icon,
                  color: destructive ? AppColors.error : AppColors.primary,
                  size: 21,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  label,
                  style: AppTypography.label.copyWith(
                    color: foreground,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: destructive
                    ? AppColors.error
                    : AppColors.secondaryTextAccessible,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfilePhotoPreviewScreen extends StatelessWidget {
  const _ProfilePhotoPreviewScreen({required this.imagePath});

  final String imagePath;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.mainText,
        elevation: 0,
        scrolledUnderElevation: 0,
        leadingWidth: 92,
        leading: TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: Text(
            'Cancel',
            style: AppTypography.label.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        title: Text(
          'Preview photo',
          style: AppTypography.title.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              'Use photo',
              style: AppTypography.label.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Center(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = constraints.maxWidth.clamp(220.0, 360.0);

                return Container(
                  width: size,
                  height: size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.primarySubtle,
                    border: Border.all(color: AppColors.primary, width: 2),
                    boxShadow: AppShadows.card,
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Image.file(File(imagePath), fit: BoxFit.cover),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _AccountFormField extends StatelessWidget {
  const _AccountFormField({
    required this.label,
    required this.controller,
    this.isRequired = false,
    this.validator,
    this.keyboardType,
    this.autofillHints,
  });

  final String label;
  final TextEditingController controller;
  final bool isRequired;
  final FormFieldValidator<String>? validator;
  final TextInputType? keyboardType;
  final Iterable<String>? autofillHints;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: isRequired ? '$label, required' : label,
      textField: true,
      enabled: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: label,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (isRequired)
                  TextSpan(
                    text: ' *',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 7),
          TextFormField(
            controller: controller,
            enabled: true,
            keyboardType: keyboardType,
            autofillHints: autofillHints,
            validator: validator,
            style: AppTypography.body.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w600,
            ),
            decoration: InputDecoration(
              filled: true,
              fillColor: AppColors.surface,
              isDense: false,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: 16,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.large),
                borderSide: const BorderSide(color: AppColors.border, width: 1),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.large),
                borderSide: const BorderSide(
                  color: AppColors.primary,
                  width: 1.5,
                ),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.large),
                borderSide: const BorderSide(color: AppColors.error, width: 1),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.large),
                borderSide: const BorderSide(
                  color: AppColors.error,
                  width: 1.5,
                ),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.large),
                borderSide: const BorderSide(color: AppColors.disabled),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ContactStatusRow extends StatelessWidget {
  const _ContactStatusRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.verified,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool verified;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.medium),
          ),
          child: Icon(icon, color: AppColors.primary, size: 20),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: AppTypography.caption.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(
                    verified
                        ? Icons.verified_rounded
                        : Icons.info_outline_rounded,
                    size: 15,
                    color: verified
                        ? AppColors.success
                        : AppColors.primaryStrong,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    verified ? 'Verified' : 'Verification required',
                    style: AppTypography.caption.copyWith(
                      color: verified
                          ? AppColors.success
                          : AppColors.primaryStrong,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (actionLabel != null && onAction != null)
          TextButton(onPressed: onAction, child: Text(actionLabel!)),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.icon,
    required this.child,
    this.description,
  });

  final String title;
  final IconData icon;
  final String? description;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final borderRadius = BorderRadius.circular(AppRadius.large);

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.lg),
      decoration: BoxDecoration(
        borderRadius: borderRadius,
        boxShadow: AppShadows.card,
      ),
      child: Material(
        color: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: borderRadius,
          side: const BorderSide(color: AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.primarySubtle,
                      borderRadius: BorderRadius.circular(AppRadius.medium),
                    ),
                    child: Icon(icon, color: AppColors.primary, size: 20),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      title,
                      style: AppTypography.sectionTitle.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
              if (description != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(
                  description!,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.4,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _SecurityRow extends StatelessWidget {
  const _SecurityRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final foreground = destructive ? AppColors.error : AppColors.mainText;

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        icon,
        color: destructive ? AppColors.error : AppColors.primary,
      ),
      title: Text(
        title,
        style: AppTypography.label.copyWith(
          color: foreground,
          fontWeight: FontWeight.w900,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: AppTypography.caption.copyWith(
          color: AppColors.secondaryTextAccessible,
          height: 1.35,
        ),
      ),
      trailing: Icon(
        Icons.chevron_right_rounded,
        color: destructive
            ? AppColors.error
            : AppColors.secondaryTextAccessible,
      ),
      onTap: onTap,
    );
  }
}
