import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';
import 'provider_addon_form_screen.dart';

class ProviderAddonsScreen extends StatefulWidget {
  const ProviderAddonsScreen({super.key});

  @override
  State<ProviderAddonsScreen> createState() => _ProviderAddonsScreenState();
}

class _ProviderAddonsScreenState extends State<ProviderAddonsScreen> {
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

      setState(() {
        isLoadingProvider = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    }
  }

  Future<void> _deleteAddon(AddonModel addon) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Delete Service'),
          content: Text(
            'Are you sure you want to delete ${addon.name}? This will hide it from customers.',
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
      await repository.deactivateAddon(addon.id);

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Service deleted.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    final title = provider?.providerServiceType == 'addon'
        ? 'My Services'
        : 'My Add-ons';

    final addButtonLabel = provider?.providerServiceType == 'addon'
        ? 'Add Service'
        : 'Add Add-on';

    return Scaffold(
      appBar: AppBar(
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w900),
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
                    builder: (_) => ProviderAddonFormScreen(
                      providerId: provider!.id,
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.add),
              label: Text(
                addButtonLabel,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
      body: isLoadingProvider
          ? const FeastaSkeletonList(
              itemCount: 5,
              padding: EdgeInsets.all(16),
              showLeading: false,
            )
          : provider == null
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'Provider profile not found.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                )
              : StreamBuilder<List<AddonModel>>(
                  stream: repository.myProviderAddons(provider!.id),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const FeastaSkeletonList(
                        itemCount: 5,
                        padding: EdgeInsets.all(16),
                        showLeading: false,
                      );
                    }

                    if (snapshot.hasError) {
                      return Center(
                        child: Text('Error: ${snapshot.error}'),
                      );
                    }

                    final addons = snapshot.data ?? [];

                    if (addons.isEmpty) {
                      return Center(
                        child: Padding(
                          padding: const EdgeInsets.all(28),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.add_box_outlined,
                                size: 80,
                                color: Colors.grey,
                              ),
                              const SizedBox(height: 18),
                              Text(
                                provider!.providerServiceType == 'addon'
                                    ? 'No services yet'
                                    : 'No add-ons yet',
                                style: const TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                provider!.providerServiceType == 'addon'
                                    ? 'Create your services such as photography, hosting, sound system, decoration, or rentals.'
                                    : 'Create optional services like photo booth, extra decorations, or equipment rentals.',
                                textAlign: TextAlign.center,
                                style: const TextStyle(
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
                      itemCount: addons.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 16),
                      itemBuilder: (context, index) {
                        final addon = addons[index];

                        return ProviderAddonCard(
                          addon: addon,
                          onEdit: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ProviderAddonFormScreen(
                                  providerId: provider!.id,
                                  existingAddon: addon,
                                ),
                              ),
                            );
                          },
                          onDelete: () => _deleteAddon(addon),
                        );
                      },
                    );
                  },
                ),
    );
  }
}

class ProviderAddonCard extends StatelessWidget {
  final AddonModel addon;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const ProviderAddonCard({
    super.key,
    required this.addon,
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
          if (addon.imageUrl != null && addon.imageUrl!.isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.network(
                addon.imageUrl!,
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
                  addon.name,
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: addon.isAvailable
                      ? Colors.green.withOpacity(0.12)
                      : Colors.red.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  addon.isAvailable ? 'Available' : 'Unavailable',
                  style: TextStyle(
                    color: addon.isAvailable ? Colors.green : Colors.red,
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            addon.category,
            style: const TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 10),
          Text(
            addon.description,
            style: const TextStyle(
              color: Colors.grey,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            '₱${addon.price.toStringAsFixed(0)}',
            style: const TextStyle(
              color: primary,
              fontSize: 22,
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
