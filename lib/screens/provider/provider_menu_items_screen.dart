import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';
import 'provider_menu_item_form_screen.dart';

class ProviderMenuItemsScreen extends StatefulWidget {
  const ProviderMenuItemsScreen({super.key});

  @override
  State<ProviderMenuItemsScreen> createState() =>
      _ProviderMenuItemsScreenState();
}

class _ProviderMenuItemsScreenState extends State<ProviderMenuItemsScreen> {
  final FeastaRepository repository = FeastaRepository();

  ProviderModel? provider;
  bool isLoadingProvider = true;

  @override
  void initState() {
    super.initState();
    _loadProvider();
  }

  Future<void> _loadProvider() async {
    try {
      final result = await repository.getMyProviderProfile();

      if (!mounted) return;

      setState(() {
        provider = result;
        isLoadingProvider = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() => isLoadingProvider = false);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception: ', ''))),
      );
    }
  }

  Future<void> _deleteMenuItem(MenuItemModel item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Delete Menu Item'),
          content: Text(
            'Are you sure you want to delete ${item.name}? This will hide it from customers.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );

    if (confirm != true) return;

    try {
      await repository.deactivateMenuItem(item.id);

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Menu item deleted.')),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'My Menu Items',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      floatingActionButton: provider == null
          ? null
          : FloatingActionButton.extended(
              backgroundColor: primary,
              foregroundColor: Colors.white,
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ProviderMenuItemFormScreen(
                      providerId: provider!.id,
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.add),
              label: const Text(
                'Add Menu Item',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
      body: isLoadingProvider
          ? const FeastaSkeletonList(
              itemCount: 5,
              padding: EdgeInsets.all(16),
              showLeading: false,
              showTrailing: false,
            )
          : provider == null
              ? const Center(child: Text('Provider profile not found.'))
              : StreamBuilder<List<MenuItemModel>>(
                  stream: repository.myProviderMenuItems(provider!.id),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const FeastaSkeletonList(
                        itemCount: 5,
                        padding: EdgeInsets.all(16),
                        showLeading: false,
                        showTrailing: false,
                      );
                    }

                    if (snapshot.hasError) {
                      return Center(child: Text('Error: ${snapshot.error}'));
                    }

                    final items = snapshot.data ?? [];

                    if (items.isEmpty) {
                      return const Center(
                        child: Padding(
                          padding: EdgeInsets.all(28),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.restaurant_menu,
                                size: 80,
                                color: Colors.grey,
                              ),
                              SizedBox(height: 18),
                              Text(
                                'No menu items yet',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              SizedBox(height: 8),
                              Text(
                                'Add food items that customers can view in your provider profile.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: Colors.grey,
                                  height: 1.4,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }

                    return ListView.separated(
                      padding: const EdgeInsets.all(20),
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 16),
                      itemBuilder: (context, index) {
                        final item = items[index];

                        return MenuItemCard(
                          item: item,
                          onEdit: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ProviderMenuItemFormScreen(
                                  providerId: provider!.id,
                                  existingItem: item,
                                ),
                              ),
                            );
                          },
                          onDelete: () => _deleteMenuItem(item),
                        );
                      },
                    );
                  },
                ),
    );
  }
}

class MenuItemCard extends StatelessWidget {
  final MenuItemModel item;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const MenuItemCard({
    super.key,
    required this.item,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

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
          if (item.imageUrl != null && item.imageUrl!.isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.network(
                item.imageUrl!,
                height: 150,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) {
                  return Container(
                    height: 150,
                    color: Colors.grey.shade300,
                    child: const Icon(Icons.broken_image),
                  );
                },
              ),
            ),
            const SizedBox(height: 14),
          ],
          Row(
            children: [
              Expanded(
                child: Text(
                  item.name,
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                '₱${item.pricePerServing.toStringAsFixed(0)}',
                style: const TextStyle(
                  color: primary,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(item.category, style: const TextStyle(color: Colors.grey)),
          const SizedBox(height: 10),
          Text(
            item.description,
            style: const TextStyle(color: Colors.grey, height: 1.4),
          ),
          const SizedBox(height: 10),
          Text(
            item.isAvailable ? 'Available' : 'Unavailable',
            style: TextStyle(
              color: item.isAvailable ? Colors.green : Colors.red,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text(
                    'Edit',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete_outline),
                  label: const Text(
                    'Delete',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.red,
                    side: const BorderSide(color: Colors.red),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
