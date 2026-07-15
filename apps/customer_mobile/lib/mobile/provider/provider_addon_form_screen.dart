import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';

class ProviderAddonFormScreen extends StatefulWidget {
  final String providerId;
  final AddonModel? existingAddon;

  const ProviderAddonFormScreen({
    super.key,
    required this.providerId,
    this.existingAddon,
  });

  @override
  State<ProviderAddonFormScreen> createState() =>
      _ProviderAddonFormScreenState();
}

class _ProviderAddonFormScreenState extends State<ProviderAddonFormScreen> {
  final FeastaRepository repository = FeastaRepository();

  final nameController = TextEditingController();
  final descriptionController = TextEditingController();
  final priceController = TextEditingController();
  final imageUrlController = TextEditingController();

  String selectedCategory = 'Entertainment';
  bool isAvailable = true;
  bool isSaving = false;

  final List<String> categories = const [
    'Entertainment',
    'Photography',
    'Host / Emcee',
    'Sound System',
    'Lights',
    'Decoration',
    'Equipment',
    'Food',
    'Service',
    'Rental',
    'Other',
  ];

  bool get isEditing => widget.existingAddon != null;

  @override
  void initState() {
    super.initState();

    final addon = widget.existingAddon;

    if (addon != null) {
      nameController.text = addon.name;
      descriptionController.text = addon.description;
      priceController.text = addon.price.toStringAsFixed(0);
      imageUrlController.text = addon.imageUrl ?? '';

      if (categories.contains(addon.category)) {
        selectedCategory = addon.category;
      } else {
        selectedCategory = 'Other';
      }

      isAvailable = addon.isAvailable;
    }
  }

  Future<void> _saveAddon() async {
    final name = nameController.text.trim();
    final description = descriptionController.text.trim();
    final price = double.tryParse(priceController.text.trim());

    if (name.isEmpty || description.isEmpty || price == null) {
      _showMessage('Please complete all required fields with valid values.');
      return;
    }

    if (price <= 0) {
      _showMessage('Price must be greater than 0.');
      return;
    }

    setState(() => isSaving = true);

    try {
      if (isEditing) {
        await repository.updateAddon(
          addonId: widget.existingAddon!.id,
          name: name,
          description: description,
          category: selectedCategory,
          price: price,
          imageUrl: imageUrlController.text,
          isAvailable: isAvailable,
        );
      } else {
        await repository.createAddon(
          providerId: widget.providerId,
          name: name,
          description: description,
          category: selectedCategory,
          price: price,
          imageUrl: imageUrlController.text,
          isAvailable: isAvailable,
        );
      }

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isEditing ? 'Service updated.' : 'Service created.'),
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
    imageUrlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          isEditing ? 'Edit Service' : 'Add Service',
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFE5E7EB)),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Service / Add-on Name',
                    hintText: 'Photo Booth / Wedding Photography / Sound System',
                  ),
                ),
                const SizedBox(height: 14),

                TextField(
                  controller: descriptionController,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    hintText: 'Describe this service or add-on',
                  ),
                ),
                const SizedBox(height: 14),

                DropdownButtonFormField<String>(
                  initialValue: selectedCategory,
                  decoration: const InputDecoration(
                    labelText: 'Category',
                  ),
                  items: categories.map((category) {
                    return DropdownMenuItem(
                      value: category,
                      child: Text(category),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value == null) return;

                    setState(() {
                      selectedCategory = value;
                    });
                  },
                ),
                const SizedBox(height: 14),

                TextField(
                  controller: priceController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Price',
                    hintText: '3500',
                  ),
                ),
                const SizedBox(height: 14),

                TextField(
                  controller: imageUrlController,
                  decoration: const InputDecoration(
                    labelText: 'Image URL',
                    hintText: 'Optional image URL',
                  ),
                ),
                const SizedBox(height: 14),

                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  activeThumbColor: primary,
                  value: isAvailable,
                  title: const Text(
                    'Available',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: const Text(
                    'Only available services/add-ons will appear to customers.',
                  ),
                  onChanged: (value) {
                    setState(() {
                      isAvailable = value;
                    });
                  },
                ),
              ],
            ),
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
              onPressed: isSaving ? null : _saveAddon,
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: isSaving
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(
                      isEditing ? 'Update Service' : 'Create Service',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}