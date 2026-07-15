import 'package:flutter/material.dart';

import '../../models/customer_address_model.dart';

const Color _primary = Color(0xFFFF6333);
const Color _background = Color(0xFFF8F6F3);
const Color _textPrimary = Color(0xFF2B211D);
const Color _textSecondary = Color(0xFF8C817A);
const Color _border = Color(0xFFE8E1DB);

class ManualAddressScreen extends StatefulWidget {
  final CustomerAddressModel? initialAddress;
  final bool preserveAddressId;

  const ManualAddressScreen({
    super.key,
    this.initialAddress,
    this.preserveAddressId = false,
  });

  @override
  State<ManualAddressScreen> createState() => _ManualAddressScreenState();
}

class _ManualAddressScreenState extends State<ManualAddressScreen> {
  final formKey = GlobalKey<FormState>();

  late final TextEditingController labelController;
  late final TextEditingController houseNumberController;
  late final TextEditingController streetController;
  late final TextEditingController barangayController;
  late final TextEditingController cityController;
  late final TextEditingController provinceController;
  late final TextEditingController postalCodeController;
  late final TextEditingController notesController;

  @override
  void initState() {
    super.initState();

    final initialAddress = widget.initialAddress;
    labelController = TextEditingController(
      text: initialAddress?.addressLabel ?? '',
    );
    houseNumberController = TextEditingController(
      text: initialAddress?.houseNumber ?? '',
    );
    streetController = TextEditingController(
      text: initialAddress?.streetName ?? '',
    );
    barangayController = TextEditingController(
      text: initialAddress?.barangay ?? '',
    );
    cityController = TextEditingController(
      text: _initialValue(
        initialAddress?.city,
        CustomerAddressModel.defaultOrmoc.city,
      ),
    );
    provinceController = TextEditingController(
      text: _initialValue(
        initialAddress?.province,
        CustomerAddressModel.defaultOrmoc.province,
      ),
    );
    postalCodeController = TextEditingController(
      text: initialAddress?.postalCode ?? '',
    );
    notesController = TextEditingController(text: initialAddress?.notes ?? '');
  }

  @override
  void dispose() {
    labelController.dispose();
    houseNumberController.dispose();
    streetController.dispose();
    barangayController.dispose();
    cityController.dispose();
    provinceController.dispose();
    postalCodeController.dispose();
    notesController.dispose();
    super.dispose();
  }

  void _saveAddress() {
    if (!(formKey.currentState?.validate() ?? false)) return;

    final initialAddress = widget.initialAddress;
    final houseNumber = houseNumberController.text.trim();
    final streetName = streetController.text.trim();
    final barangay = barangayController.text.trim();
    final city = cityController.text.trim();
    final province = provinceController.text.trim();
    final postalCode = postalCodeController.text.trim();
    final notes = notesController.text.trim();
    final label = labelController.text.trim();
    final fullAddress = _composeFullAddress(
      houseNumber: houseNumber,
      streetName: streetName,
      barangay: barangay,
      city: city,
      province: province,
      postalCode: postalCode,
    );

    Navigator.pop(
      context,
      CustomerAddressModel(
        id: widget.preserveAddressId && initialAddress != null
            ? initialAddress.id
            : newCustomerAddressId(),
        addressLabel: label.isEmpty ? 'Home' : label,
        fullAddress: fullAddress,
        streetName: streetName,
        barangay: barangay,
        city: city,
        province: province,
        postalCode: postalCode,
        country: CustomerAddressModel.defaultOrmoc.country,
        latitude:
            initialAddress?.latitude ??
            CustomerAddressModel.defaultOrmoc.latitude,
        longitude:
            initialAddress?.longitude ??
            CustomerAddressModel.defaultOrmoc.longitude,
        isDefault: initialAddress?.isDefault ?? false,
        createdAt: initialAddress?.createdAt ?? DateTime.now(),
        houseNumber: houseNumber,
        notes: notes,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.initialAddress != null;

    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: _textPrimary,
        elevation: 0.5,
        title: Text(
          editing ? 'Edit Address' : 'Add New Address',
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: _cardDecoration(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Address details',
                    style: TextStyle(
                      color: _textPrimary,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Add complete details so caterers can find the event location.',
                    style: TextStyle(
                      color: _textSecondary,
                      height: 1.3,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 18),
                  _AddressTextField(
                    controller: labelController,
                    label: 'Address Label',
                    hint: 'Home, Work, Venue',
                    icon: Icons.bookmark_border_rounded,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 12),
                  _AddressTextField(
                    controller: houseNumberController,
                    label: 'House/Unit Number',
                    hint: 'Unit 2, 123, Floor 4',
                    icon: Icons.apartment_rounded,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 12),
                  _AddressTextField(
                    controller: streetController,
                    label: 'Street Name',
                    hint: 'Rizal Street',
                    icon: Icons.signpost_outlined,
                    requiredField: true,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 12),
                  _AddressTextField(
                    controller: barangayController,
                    label: 'Barangay',
                    hint: 'Barangay District 1',
                    icon: Icons.location_city_outlined,
                    requiredField: true,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: _AddressTextField(
                          controller: cityController,
                          label: 'City',
                          hint: 'Ormoc City',
                          icon: Icons.location_on_outlined,
                          requiredField: true,
                          textInputAction: TextInputAction.next,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _AddressTextField(
                          controller: provinceController,
                          label: 'Province',
                          hint: 'Leyte',
                          icon: Icons.map_outlined,
                          requiredField: true,
                          textInputAction: TextInputAction.next,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _AddressTextField(
                    controller: postalCodeController,
                    label: 'Postal Code',
                    hint: '6541',
                    icon: Icons.markunread_mailbox_outlined,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 12),
                  _AddressTextField(
                    controller: notesController,
                    label: 'Notes',
                    hint: 'Gate color, landmark, contact instruction',
                    icon: Icons.notes_outlined,
                    minLines: 2,
                    maxLines: 3,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              height: 56,
              child: ElevatedButton(
                onPressed: _saveAddress,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: Text(
                  editing ? 'Save changes' : 'Save address',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddressTextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final bool requiredField;
  final int minLines;
  final int maxLines;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;

  const _AddressTextField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.requiredField = false,
    this.minLines = 1,
    this.maxLines = 1,
    this.keyboardType,
    this.textInputAction,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      minLines: minLines,
      maxLines: maxLines,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      validator: (value) {
        if (!requiredField) return null;

        final text = value?.trim() ?? '';
        if (text.isEmpty) return '$label is required';

        return null;
      },
      decoration: InputDecoration(
        labelText: requiredField ? '$label *' : label,
        hintText: hint,
        prefixIcon: Icon(icon),
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: _border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: _border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: _primary, width: 1.4),
        ),
      ),
    );
  }
}

BoxDecoration _cardDecoration() {
  return BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(18),
    border: Border.all(color: _border),
    boxShadow: const [
      BoxShadow(color: Color(0x08000000), blurRadius: 14, offset: Offset(0, 6)),
    ],
  );
}

String _initialValue(String? value, String fallback) {
  final trimmed = value?.trim() ?? '';
  return trimmed.isEmpty ? fallback : trimmed;
}

String _composeFullAddress({
  required String houseNumber,
  required String streetName,
  required String barangay,
  required String city,
  required String province,
  required String postalCode,
}) {
  final streetLine = [
    houseNumber,
    streetName,
  ].where((value) => value.trim().isNotEmpty).join(' ');

  return [
    streetLine,
    barangay,
    city,
    province,
    postalCode,
    CustomerAddressModel.defaultOrmoc.country,
  ].where((value) => value.trim().isNotEmpty).join(', ');
}
