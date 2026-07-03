import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';

class ProviderPackageFormScreen extends StatefulWidget {
  final String providerId;
  final PackageModel? existingPackage;

  const ProviderPackageFormScreen({
    super.key,
    required this.providerId,
    this.existingPackage,
  });

  @override
  State<ProviderPackageFormScreen> createState() =>
      _ProviderPackageFormScreenState();
}

class _ProviderPackageFormScreenState extends State<ProviderPackageFormScreen> {
  final FeastaRepository repository = FeastaRepository();

  final nameController = TextEditingController();
  final descriptionController = TextEditingController();
  final priceController = TextEditingController();
  final downPaymentController = TextEditingController(text: '30');
  final guestCapacityController = TextEditingController();
  final minimumGuestsController = TextEditingController();
  final maximumGuestsController = TextEditingController();
  final imageUrlController = TextEditingController();

  final foodController = TextEditingController();
  final decorController = TextEditingController();
  final furnitureController = TextEditingController();
  final serviceController = TextEditingController();

  String selectedEventType = 'Birthday';
  bool isCustomizable = true;
  bool isSaving = false;

  final List<String> foodInclusions = [];
  final List<String> decorInclusions = [];
  final List<String> furnitureInclusions = [];
  final List<String> serviceInclusions = [];

  final List<String> eventTypes = const [
    'Birthday',
    'Wedding',
    'Anniversary',
    'Reunion',
    'Corporate',
    'Baptism',
    'Graduation',
    'Other',
  ];

  bool get isEditing => widget.existingPackage != null;

  @override
  void initState() {
    super.initState();

    final package = widget.existingPackage;

    if (package != null) {
      nameController.text = package.name;
      descriptionController.text = package.description;
      priceController.text = package.price.toStringAsFixed(0);
      downPaymentController.text =
          package.downPaymentPercentage.toStringAsFixed(0);
      guestCapacityController.text = package.guestCapacity.toString();
      minimumGuestsController.text = package.minimumGuests.toString();
      maximumGuestsController.text = package.maximumGuests.toString();
      imageUrlController.text = package.imageUrl ?? '';
      selectedEventType = package.eventType;
      isCustomizable = package.isCustomizable;

      foodInclusions.addAll(package.foodInclusions);
      decorInclusions.addAll(package.decorInclusions);
      furnitureInclusions.addAll(package.furnitureInclusions);
      serviceInclusions.addAll(package.serviceInclusions);
    }
  }

  void _addItem({
    required TextEditingController controller,
    required List<String> list,
  }) {
    final value = controller.text.trim();

    if (value.isEmpty) return;

    setState(() {
      list.add(value);
      controller.clear();
    });
  }

  void _removeItem({
    required String item,
    required List<String> list,
  }) {
    setState(() {
      list.remove(item);
    });
  }

  Future<void> _savePackage() async {
    final name = nameController.text.trim();
    final description = descriptionController.text.trim();
    final price = double.tryParse(priceController.text.trim());
    final downPaymentPercentage =
        double.tryParse(downPaymentController.text.trim());
    final guestCapacity = int.tryParse(guestCapacityController.text.trim());
    final minimumGuests = int.tryParse(minimumGuestsController.text.trim());
    final maximumGuests = int.tryParse(maximumGuestsController.text.trim());

    if (name.isEmpty ||
        description.isEmpty ||
        price == null ||
        downPaymentPercentage == null ||
        guestCapacity == null ||
        minimumGuests == null ||
        maximumGuests == null) {
      _showMessage('Please complete all required fields with valid values.');
      return;
    }

    if (price <= 0) {
      _showMessage('Price must be greater than 0.');
      return;
    }

    if (downPaymentPercentage <= 0 || downPaymentPercentage > 100) {
      _showMessage('Down payment percentage must be between 1 and 100.');
      return;
    }

    if (minimumGuests > maximumGuests) {
      _showMessage('Minimum guests cannot be greater than maximum guests.');
      return;
    }

    if (guestCapacity < minimumGuests || guestCapacity > maximumGuests) {
      _showMessage('Guest capacity must be within the minimum and maximum guests.');
      return;
    }

    if (foodInclusions.isEmpty &&
        decorInclusions.isEmpty &&
        furnitureInclusions.isEmpty &&
        serviceInclusions.isEmpty) {
      _showMessage('Please add at least one inclusion.');
      return;
    }

    setState(() => isSaving = true);

    try {
      if (isEditing) {
        await repository.updatePackage(
          packageId: widget.existingPackage!.id,
          name: name,
          description: description,
          eventType: selectedEventType,
          price: price,
          downPaymentPercentage: downPaymentPercentage,
          guestCapacity: guestCapacity,
          minimumGuests: minimumGuests,
          maximumGuests: maximumGuests,
          imageUrl: imageUrlController.text,
          foodInclusions: foodInclusions,
          decorInclusions: decorInclusions,
          furnitureInclusions: furnitureInclusions,
          serviceInclusions: serviceInclusions,
          isCustomizable: isCustomizable,
        );
      } else {
        await repository.createPackage(
          providerId: widget.providerId,
          name: name,
          description: description,
          eventType: selectedEventType,
          price: price,
          downPaymentPercentage: downPaymentPercentage,
          guestCapacity: guestCapacity,
          minimumGuests: minimumGuests,
          maximumGuests: maximumGuests,
          imageUrl: imageUrlController.text,
          foodInclusions: foodInclusions,
          decorInclusions: decorInclusions,
          furnitureInclusions: furnitureInclusions,
          serviceInclusions: serviceInclusions,
          isCustomizable: isCustomizable,
        );
      }

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isEditing ? 'Package updated.' : 'Package created.'),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => isSaving = false);
      }
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  void dispose() {
    nameController.dispose();
    descriptionController.dispose();
    priceController.dispose();
    downPaymentController.dispose();
    guestCapacityController.dispose();
    minimumGuestsController.dispose();
    maximumGuestsController.dispose();
    imageUrlController.dispose();
    foodController.dispose();
    decorController.dispose();
    furnitureController.dispose();
    serviceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          isEditing ? 'Edit Package' : 'Add Package',
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _Section(
            title: 'Basic Information',
            children: [
              _Field(
                label: 'Package Name',
                controller: nameController,
                hint: 'Birthday Bash Package',
              ),
              const SizedBox(height: 14),
              _Field(
                label: 'Description',
                controller: descriptionController,
                hint: 'Describe this package',
                maxLines: 4,
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                value: selectedEventType,
                decoration: const InputDecoration(
                  labelText: 'Event Type',
                ),
                items: eventTypes.map((type) {
                  return DropdownMenuItem(
                    value: type,
                    child: Text(type),
                  );
                }).toList(),
                onChanged: (value) {
                  if (value == null) return;
                  setState(() {
                    selectedEventType = value;
                  });
                },
              ),
              const SizedBox(height: 14),
              _Field(
                label: 'Image URL',
                controller: imageUrlController,
                hint: 'Optional image URL',
              ),
            ],
          ),
          const SizedBox(height: 18),
          _Section(
            title: 'Pricing & Guests',
            children: [
              _Field(
                label: 'Price',
                controller: priceController,
                hint: '18500',
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 14),
              _Field(
                label: 'Down Payment Percentage',
                controller: downPaymentController,
                hint: '30',
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 14),
              _Field(
                label: 'Guest Capacity',
                controller: guestCapacityController,
                hint: '50',
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _Field(
                      label: 'Min Guests',
                      controller: minimumGuestsController,
                      hint: '30',
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _Field(
                      label: 'Max Guests',
                      controller: maximumGuestsController,
                      hint: '70',
                      keyboardType: TextInputType.number,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: isCustomizable,
                activeColor: primary,
                title: const Text(
                  'Customizable Package',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: const Text(
                  'Allow customers to customize inclusions during booking.',
                ),
                onChanged: (value) {
                  setState(() {
                    isCustomizable = value;
                  });
                },
              ),
            ],
          ),
          const SizedBox(height: 18),
          InclusionEditor(
            title: 'Food Inclusions',
            controller: foodController,
            items: foodInclusions,
            onAdd: () {
              _addItem(controller: foodController, list: foodInclusions);
            },
            onRemove: (item) {
              _removeItem(item: item, list: foodInclusions);
            },
          ),
          const SizedBox(height: 18),
          InclusionEditor(
            title: 'Decoration Inclusions',
            controller: decorController,
            items: decorInclusions,
            onAdd: () {
              _addItem(controller: decorController, list: decorInclusions);
            },
            onRemove: (item) {
              _removeItem(item: item, list: decorInclusions);
            },
          ),
          const SizedBox(height: 18),
          InclusionEditor(
            title: 'Furniture Inclusions',
            controller: furnitureController,
            items: furnitureInclusions,
            onAdd: () {
              _addItem(
                controller: furnitureController,
                list: furnitureInclusions,
              );
            },
            onRemove: (item) {
              _removeItem(item: item, list: furnitureInclusions);
            },
          ),
          const SizedBox(height: 18),
          InclusionEditor(
            title: 'Service Inclusions',
            controller: serviceController,
            items: serviceInclusions,
            onAdd: () {
              _addItem(
                controller: serviceController,
                list: serviceInclusions,
              );
            },
            onRemove: (item) {
              _removeItem(item: item, list: serviceInclusions);
            },
          ),
          const SizedBox(height: 100),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(18),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(color: Color(0xFFE5E7EB)),
          ),
        ),
        child: SafeArea(
          child: SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: isSaving ? null : _savePackage,
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: isSaving
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(
                      isEditing ? 'Update Package' : 'Create Package',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _Section({
    required this.title,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String hint;
  final int maxLines;
  final TextInputType? keyboardType;

  const _Field({
    required this.label,
    required this.controller,
    required this.hint,
    this.maxLines = 1,
    this.keyboardType,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
      ),
    );
  }
}

class InclusionEditor extends StatelessWidget {
  final String title;
  final TextEditingController controller;
  final List<String> items;
  final VoidCallback onAdd;
  final void Function(String item) onRemove;

  const InclusionEditor({
    super.key,
    required this.title,
    required this.controller,
    required this.items,
    required this.onAdd,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: title,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                decoration: InputDecoration(
                  hintText: 'Add $title item',
                ),
              ),
            ),
            const SizedBox(width: 10),
            IconButton(
              onPressed: onAdd,
              icon: const Icon(Icons.add_circle),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (items.isEmpty)
          const Text(
            'No items added yet.',
            style: TextStyle(color: Colors.grey),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: items.map((item) {
              return Chip(
                label: Text(item),
                deleteIcon: const Icon(Icons.close),
                onDeleted: () => onRemove(item),
              );
            }).toList(),
          ),
      ],
    );
  }
}