import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';
import 'provider_package_form_screen.dart';

class ProviderPackagesScreen extends StatefulWidget {
  const ProviderPackagesScreen({super.key});

  @override
  State<ProviderPackagesScreen> createState() => _ProviderPackagesScreenState();
}

class _ProviderPackagesScreenState extends State<ProviderPackagesScreen> {
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

  Future<void> _deletePackage(PackageModel package) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Delete Package'),
          content: Text(
            'Are you sure you want to delete ${package.name}? This will hide it from customers.',
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
      await repository.deactivatePackage(package.id);

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Package deleted.'),
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

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'My Packages',
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
                    builder: (_) => ProviderPackageFormScreen(
                      providerId: provider!.id,
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.add),
              label: const Text(
                'Add Package',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
      body: isLoadingProvider
          ? const FeastaSkeletonList(
              itemCount: 5,
              padding: EdgeInsets.all(16),
              showLeading: false,
              showTrailing: false,
              showImage: true,
              imageHeight: 150,
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
              : StreamBuilder<List<PackageModel>>(
                  stream: repository.myProviderPackages(provider!.id),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const FeastaSkeletonList(
                        itemCount: 5,
                        padding: EdgeInsets.all(16),
                        showLeading: false,
                        showTrailing: false,
                        showImage: true,
                        imageHeight: 150,
                      );
                    }

                    if (snapshot.hasError) {
                      return Center(
                        child: Text('Error: ${snapshot.error}'),
                      );
                    }

                    final packages = snapshot.data ?? [];

                    if (packages.isEmpty) {
                      return const Center(
                        child: Padding(
                          padding: EdgeInsets.all(28),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.inventory_2_outlined,
                                size: 80,
                                color: Colors.grey,
                              ),
                              SizedBox(height: 18),
                              Text(
                                'No packages yet',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              SizedBox(height: 8),
                              Text(
                                'Create your first catering package so customers can book your services.',
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
                      itemCount: packages.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 16),
                      itemBuilder: (context, index) {
                        final package = packages[index];

                        return ProviderPackageCard(
                          package: package,
                          onEdit: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ProviderPackageFormScreen(
                                  providerId: provider!.id,
                                  existingPackage: package,
                                ),
                              ),
                            );
                          },
                          onDelete: () => _deletePackage(package),
                        );
                      },
                    );
                  },
                ),
    );
  }
}

class ProviderPackageCard extends StatelessWidget {
  final PackageModel package;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const ProviderPackageCard({
    super.key,
    required this.package,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(18),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          package.imageUrl == null || package.imageUrl!.isEmpty
              ? Container(
                  height: 170,
                  width: double.infinity,
                  color: Colors.grey.shade300,
                  child: const Icon(
                    Icons.image_outlined,
                    color: Colors.grey,
                    size: 60,
                  ),
                )
              : Image.network(
                  package.imageUrl!,
                  height: 170,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) {
                    return Container(
                      height: 170,
                      color: Colors.grey.shade300,
                      child: const Icon(Icons.broken_image),
                    );
                  },
                ),
          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  package.name,
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  package.eventType,
                  style: const TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Icon(
                      Icons.people_outline,
                      color: Colors.grey,
                      size: 20,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${package.minimumGuests}-${package.maximumGuests} guests',
                      style: const TextStyle(color: Colors.grey),
                    ),
                    const Spacer(),
                    Text(
                      '₱${package.price.toStringAsFixed(0)}',
                      style: const TextStyle(
                        color: primary,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
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
          ),
        ],
      ),
    );
  }
}
