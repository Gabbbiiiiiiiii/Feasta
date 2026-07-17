import 'package:flutter/material.dart';

import '../../authentication/data/repositories/auth_repository.dart';
import 'email_verification_screen.dart';

class ProviderRegisterScreen extends StatefulWidget {
  const ProviderRegisterScreen({super.key});

  @override
  State<ProviderRegisterScreen> createState() => _ProviderRegisterScreenState();
}

class _ProviderRegisterScreenState extends State<ProviderRegisterScreen> {
  final AuthRepository _authRepository = AuthRepository();

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
    if (firstNameController.text.trim().isEmpty ||
        lastNameController.text.trim().isEmpty ||
        emailController.text.trim().isEmpty ||
        phoneNumberController.text.trim().isEmpty ||
        passwordController.text.trim().isEmpty ||
        confirmPasswordController.text.trim().isEmpty ||
        businessNameController.text.trim().isEmpty ||
        businessPhoneController.text.trim().isEmpty ||
        businessEmailController.text.trim().isEmpty ||
        businessAddressController.text.trim().isEmpty ||
        cityController.text.trim().isEmpty ||
        provinceController.text.trim().isEmpty ||
        descriptionController.text.trim().isEmpty) {
      _showMessage('Please complete all fields.');
      return;
    }

    if (passwordController.text.trim() !=
        confirmPasswordController.text.trim()) {
      _showMessage('Passwords do not match.');
      return;
    }

    setState(() => isLoading = true);

    try {
      await _authRepository.registerProvider(
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
          builder: (_) => EmailVerificationScreen(
            email: emailController.text.trim(),
          ),
        ),
        (_) => false,
      );
    } catch (e) {
      _showMessage(e.toString());
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
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message.replaceAll('Exception: ', ''))),
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
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Provider Registration'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              _TextInput(
                label: 'First Name',
                controller: firstNameController,
                hint: 'Maria',
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Last Name',
                controller: lastNameController,
                hint: 'Santos',
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Email',
                controller: emailController,
                hint: 'provider@email.com',
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Phone Number',
                controller: phoneNumberController,
                hint: '+639123456789',
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Password',
                controller: passwordController,
                hint: 'Create password',
                obscureText: true,
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Confirm Password',
                controller: confirmPasswordController,
                hint: 'Re-enter password',
                obscureText: true,
              ),
              const SizedBox(height: 30),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Business Information',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(height: 18),

              DropdownButtonFormField<String>(
              initialValue: selectedProviderServiceType,
              decoration: const InputDecoration(
                labelText: 'Provider Type',
              ),
              items: const [
                DropdownMenuItem(
                  value: 'catering',
                  child: Text('Catering Provider'),
                ),
                DropdownMenuItem(
                  value: 'addon',
                  child: Text('Add-on / Event Service Provider'),
                ),
              ],
              onChanged: (value) {
                if (value == null) return;

                setState(() {
                  selectedProviderServiceType = value;

                  if (value == 'catering') {
                    selectedProviderCategory = 'catering_service';
                  } else {
                    selectedProviderCategory = 'photographer';
                  }
                });
              },
            ),

            const SizedBox(height: 16),

            DropdownButtonFormField<String>(
              initialValue: selectedProviderCategory,
              decoration: const InputDecoration(
                labelText: 'Provider Category',
              ),
              items: (selectedProviderServiceType == 'catering'
                      ? cateringCategories
                      : addonCategories)
                  .entries
                  .map(
                    (entry) => DropdownMenuItem<String>(
                      value: entry.key,
                      child: Text(entry.value),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                if (value == null) return;

                setState(() {
                  selectedProviderCategory = value;
                });
              },
            ),

            const SizedBox(height: 16),

              _TextInput(
                label: 'Business Name',
                controller: businessNameController,
                hint: "Mama Rosa's Catering",
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Business Phone',
                controller: businessPhoneController,
                hint: '+639123456789',
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Business Email',
                controller: businessEmailController,
                hint: 'business@email.com',
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Business Address',
                controller: businessAddressController,
                hint: 'Brgy. Example, Ormoc City',
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'City',
                controller: cityController,
                hint: 'Ormoc City',
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Province',
                controller: provinceController,
                hint: 'Leyte',
              ),
              const SizedBox(height: 16),
              _TextInput(
                label: 'Description',
                controller: descriptionController,
                hint: 'Describe your catering business',
                maxLines: 4,
              ),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: isLoading ? null : _registerProvider,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                  ),
                  child: isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text(
                          'Create Provider Account',
                          style: TextStyle(fontWeight: FontWeight.w800),
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

class _TextInput extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String hint;
  final bool obscureText;
  final int maxLines;

  const _TextInput({
    required this.label,
    required this.controller,
    required this.hint,
    this.obscureText = false,
    this.maxLines = 1,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          obscureText: obscureText,
          maxLines: maxLines,
          decoration: InputDecoration(hintText: hint),
        ),
      ],
    );
  }
}
