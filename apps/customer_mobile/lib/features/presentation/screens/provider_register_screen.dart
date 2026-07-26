import 'package:flutter/material.dart';

import '../../../core/theme/app_breakpoints.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';
import '../../authentication/data/repositories/auth_repository.dart';
import 'email_verification_screen.dart';

class ProviderRegisterScreen extends StatefulWidget {
  const ProviderRegisterScreen({super.key});

  @override
  State<ProviderRegisterScreen> createState() => _ProviderRegisterScreenState();
}

class _ProviderRegisterScreenState extends State<ProviderRegisterScreen> {
  final _formKey = GlobalKey<FormState>();

  final firstNameController = TextEditingController();
  final lastNameController = TextEditingController();
  final emailController = TextEditingController();
  final phoneNumberController = TextEditingController();
  final passwordController = TextEditingController();
  final confirmPasswordController = TextEditingController();

  final businessNameController = TextEditingController();
  final businessPhoneController = TextEditingController();
  final businessEmailController = TextEditingController();
  final businessAddressController = TextEditingController();
  final cityController = TextEditingController(text: 'Ormoc City');
  final provinceController = TextEditingController(text: 'Leyte');
  final descriptionController = TextEditingController();

  final List<String> serviceAreas = ['Ormoc City'];
  final List<String> eventTypesSupported = [
    'Birthday',
    'Wedding',
    'Anniversary',
    'Reunion',
    'Corporate',
    'Baptism',
    'Graduation',
    'Other',
  ];

  bool isLoading = false;

  String selectedProviderServiceType = 'catering';

  Future<void> _registerProvider() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => isLoading = true);

    try {
      await AuthRepository().registerProvider(
        firstName: firstNameController.text,
        lastName: lastNameController.text,
        email: emailController.text,
        phoneNumber: phoneNumberController.text,
        password: passwordController.text,
        businessName: businessNameController.text,
        businessPhone: businessPhoneController.text,
        businessEmail: businessEmailController.text,
        businessAddress: businessAddressController.text,
        city: cityController.text,
        province: provinceController.text,
        description: descriptionController.text,
        serviceAreas: serviceAreas,
        eventTypesSupported: eventTypesSupported,
        providerServiceType: selectedProviderServiceType,
        providerCategory: selectedProviderCategory,
      );

      if (!mounted) return;

      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) =>
              EmailVerificationScreen(email: emailController.text.trim()),
        ),
        (_) => false,
      );
    } catch (_) {
      _showMessage(
        'We could not create the provider account. Check your connection and details, then try again.',
      );
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  String selectedProviderCategory = 'catering_service';

  final Map<String, String> cateringCategories = {
    'catering_service': 'Catering Service',
    'food_trays_packed_meals': 'Food Trays / Packed Meals',
    'catering_event_styling': 'Catering and Event Styling',
  };

  final Map<String, String> addonCategories = {
    'photographer': 'Photographer',
    'videographer': 'Videographer',
    'photo_booth': 'Photo Booth',
    'event_coordinator': 'Event Coordinator',
    'event_host_emcee': 'Event Host / Emcee',
    'sound_system': 'Sound System',
    'lights_and_sounds': 'Lights and Sounds',
    'singer_band': 'Singer / Band',
    'dancer_performer': 'Dancer / Performer',
    'decorator_event_stylist': 'Decorator / Event Stylist',
    'florist': 'Florist',
    'cake_provider': 'Cake Provider',
    'gown_suit_rental': 'Gown / Suit Rental',
    'car_rental': 'Car Rental',
    'venue_provider': 'Venue Provider',
    'tables_chairs_rental': 'Tables and Chairs Rental',
    'other_event_service': 'Other Event Service',
  };

  void _showMessage(String message) {
    FeastaSnackbars.show(
      context,
      message: message,
      tone: FeastaSnackbarTone.error,
    );
  }

  @override
  void dispose() {
    firstNameController.dispose();
    lastNameController.dispose();
    emailController.dispose();
    phoneNumberController.dispose();
    passwordController.dispose();
    confirmPasswordController.dispose();
    businessNameController.dispose();
    businessPhoneController.dispose();
    businessEmailController.dispose();
    businessAddressController.dispose();
    cityController.dispose();
    provinceController.dispose();
    descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Provider registration')),
      body: SafeArea(
        child: SingleChildScrollView(
          child: FeastaContentContainer(
            maxWidth: AppBreakpoints.tablet,
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Owner account', style: AppTypography.headline),
                  const SizedBox(height: AppSpacing.lg),
                  _field(
                    label: 'First Name',
                    controller: firstNameController,
                    autofillHints: const [AutofillHints.givenName],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Last Name',
                    controller: lastNameController,
                    autofillHints: const [AutofillHints.familyName],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Email',
                    controller: emailController,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Phone Number',
                    controller: phoneNumberController,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Password',
                    controller: passwordController,
                    isPassword: true,
                    autofillHints: const [AutofillHints.newPassword],
                    validator: (value) => (value?.length ?? 0) < 8
                        ? 'Use at least 8 characters.'
                        : null,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Confirm Password',
                    controller: confirmPasswordController,
                    isPassword: true,
                    autofillHints: const [AutofillHints.newPassword],
                    validator: (value) => value != passwordController.text
                        ? 'Passwords do not match.'
                        : _required(value),
                  ),
                  const SizedBox(height: AppSpacing.xxl),
                  Text('Business information', style: AppTypography.headline),
                  const SizedBox(height: AppSpacing.lg),
                  DropdownButtonFormField<String>(
                    initialValue: selectedProviderServiceType,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Provider type',
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'catering',
                        child: Text('Catering provider'),
                      ),
                      DropdownMenuItem(
                        value: 'addon',
                        child: Text('Add-on / event service provider'),
                      ),
                    ],
                    onChanged: isLoading
                        ? null
                        : (value) {
                            if (value == null) return;
                            setState(() {
                              selectedProviderServiceType = value;
                              selectedProviderCategory = value == 'catering'
                                  ? 'catering_service'
                                  : 'photographer';
                            });
                          },
                  ),
                  const SizedBox(height: AppSpacing.md),
                  DropdownButtonFormField<String>(
                    initialValue: selectedProviderCategory,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Provider category',
                    ),
                    items:
                        (selectedProviderServiceType == 'catering'
                                ? cateringCategories
                                : addonCategories)
                            .entries
                            .map(
                              (entry) => DropdownMenuItem<String>(
                                value: entry.key,
                                child: Text(
                                  entry.value,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList(),
                    onChanged: isLoading
                        ? null
                        : (value) {
                            if (value == null) return;
                            setState(() => selectedProviderCategory = value);
                          },
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Business name',
                    controller: businessNameController,
                    autofillHints: const [AutofillHints.organizationName],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Business phone',
                    controller: businessPhoneController,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Business email',
                    controller: businessEmailController,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Business address',
                    controller: businessAddressController,
                    autofillHints: const [AutofillHints.fullStreetAddress],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'City',
                    controller: cityController,
                    autofillHints: const [AutofillHints.addressCity],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Province',
                    controller: provinceController,
                    autofillHints: const [AutofillHints.addressState],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _field(
                    label: 'Description',
                    controller: descriptionController,
                    maxLines: 4,
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  FeastaPrimaryButton(
                    label: 'Create provider account',
                    loadingLabel: 'Creating provider account',
                    isLoading: isLoading,
                    onPressed: isLoading ? null : _registerProvider,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field({
    required String label,
    required TextEditingController controller,
    bool isPassword = false,
    int maxLines = 1,
    TextInputType? keyboardType,
    Iterable<String>? autofillHints,
    String? Function(String?)? validator,
  }) {
    return FeastaTextField(
      label: label,
      controller: controller,
      isRequired: true,
      enabled: !isLoading,
      isPassword: isPassword,
      maxLines: maxLines,
      keyboardType: keyboardType,
      autofillHints: autofillHints,
      validator: validator ?? _required,
    );
  }

  String? _required(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'This field is required.';
    }
    return null;
  }
}
