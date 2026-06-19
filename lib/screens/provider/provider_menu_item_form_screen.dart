import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';

class ProviderMenuItemFormScreen extends StatefulWidget {
  final String providerId;
  final MenuItemModel? existingItem;

  const ProviderMenuItemFormScreen({
    super.key,
    required this.providerId,
    this.existingItem,
  });

  @override
  State<ProviderMenuItemFormScreen> createState() =>
      _ProviderMenuItemFormScreenState();
}

class _ProviderMenuItemFormScreenState
    extends State<ProviderMenuItemFormScreen> {
  final FeastaRepository repository = FeastaRepository();

  final nameController = TextEditingController();
  final descriptionController = TextEditingController();
  final priceController = TextEditingController();
  final imageUrlController = TextEditingController();

  String selectedCategory = 'Main Dish';
  bool isAvailable = true;
  bool isSaving = false;

  final List<String> categories = const [
    'Main Dish',
    'Side Dish',
    'Dessert',
    'Drink',
    'Appetizer',
    'Other',
  ];

  bool get isEditing => widget.existingItem != null;

  @override
  void initState() {
    super.initState();

    final item = widget.existingItem;

    if (item != null) {
      nameController.text = item.name;
      descriptionController.text = item.description;
      priceController.text = item.pricePerServing.toStringAsFixed(0);
      imageUrlController.text = item.imageUrl ?? '';

      if (categories.contains(item.category)) {
        selectedCategory = item.category;
      }

      isAvailable = item.isAvailable;
    }
  }

  Future<void> _saveMenuItem() async {
    final name = nameController.text.trim();
    final description = descriptionController.text.trim();
    final price = double.tryParse(priceController.text.trim());

    if (name.isEmpty || description.isEmpty || price == null) {
      _showMessage('Please complete all required fields.');
      return;
    }

    if (price < 0) {
      _showMessage('Price cannot be negative.');
      return;
    }

    setState(() => isSaving = true);

    try {
      if (isEditing) {
        await repository.updateMenuItem(
          menuItemId: widget.existingItem!.id,
          name: name,
          description: description,
          category: selectedCategory,
          pricePerServing: price,
          imageUrl: imageUrlController.text,
          isAvailable: isAvailable,
        );
      } else {
        await repository.createMenuItem(
          providerId: widget.providerId,
          name: name,
          description: description,
          category: selectedCategory,
          pricePerServing: price,
          imageUrl: imageUrlController.text,
          isAvailable: isAvailable,
        );
      }

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isEditing ? 'Menu item updated.' : 'Menu item added.'),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception: ', ''))),
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
          isEditing ? 'Edit Menu Item' : 'Add Menu Item',
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
                    labelText: 'Menu Item Name',
                    hintText: 'Chicken BBQ',
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: descriptionController,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    hintText: 'Describe this food item',
                  ),
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: selectedCategory,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: categories.map((category) {
                    return DropdownMenuItem(
                      value: category,
                      child: Text(category),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() => selectedCategory = value);
                  },
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: priceController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Price Per Serving',
                    hintText: '120',
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
                    'Only available menu items will appear to customers.',
                  ),
                  onChanged: (value) {
                    setState(() => isAvailable = value);
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
              onPressed: isSaving ? null : _saveMenuItem,
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: isSaving
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(
                      isEditing ? 'Update Menu Item' : 'Create Menu Item',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}