import 'package:flutter/material.dart';

import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../shared/widgets/loading_skeleton.dart';

class AddonMarketplaceScreen extends StatefulWidget {
  final List<Map<String, dynamic>> selectedExternalAddOns;

  const AddonMarketplaceScreen({
    super.key,
    required this.selectedExternalAddOns,
  });

  @override
  State<AddonMarketplaceScreen> createState() => _AddonMarketplaceScreenState();
}

class _AddonMarketplaceScreenState extends State<AddonMarketplaceScreen> {
  final FeastaRepository repository = FeastaRepository();

  late List<Map<String, dynamic>> selectedAddOns;

  @override
  void initState() {
    super.initState();
    selectedAddOns = List<Map<String, dynamic>>.from(
      widget.selectedExternalAddOns,
    );
  }

  bool _isSelected(AddonModel addon) {
    return selectedAddOns.any((item) => item['addonId'] == addon.id);
  }

  void _toggleAddon(AddonModel addon, bool value) {
    setState(() {
      if (value) {
        selectedAddOns.add(
          addon.toBookingMap(source: 'feasta_addon_provider'),
        );
      } else {
        selectedAddOns.removeWhere((item) => item['addonId'] == addon.id);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Add-on Marketplace',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: StreamBuilder<List<AddonModel>>(
        stream: repository.marketplaceAddons(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const FeastaSkeletonList(
              itemCount: 6,
              padding: EdgeInsets.all(20),
              showLeading: false,
              showTrailing: true,
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Text('Unable to load add-on providers.'),
            );
          }

          final addons = snapshot.data ?? [];

          if (addons.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(28),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.add_box_outlined,
                      size: 80,
                      color: Colors.grey,
                    ),
                    SizedBox(height: 18),
                    Text(
                      'No external add-ons yet',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Verified add-on providers will appear here.',
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
            itemCount: addons.length,
            separatorBuilder: (_, __) => const SizedBox(height: 14),
            itemBuilder: (context, index) {
              final addon = addons[index];
              final selected = _isSelected(addon);

              return Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: selected ? primary.withOpacity(0.07) : Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: selected ? primary : const Color(0xFFE5E7EB),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Checkbox(
                      value: selected,
                      activeColor: primary,
                      onChanged: (value) {
                        _toggleAddon(addon, value ?? false);
                      },
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            addon.name,
                            style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            addon.providerBusinessName,
                            style: const TextStyle(
                              color: primary,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            addon.description,
                            style: const TextStyle(
                              color: Colors.grey,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Text(
                                addon.category,
                                style: const TextStyle(color: Colors.grey),
                              ),
                              const Spacer(),
                              Text(
                                '₱${addon.price.toStringAsFixed(0)}',
                                style: const TextStyle(
                                  color: primary,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 18,
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
            },
          );
        },
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
            height: 56,
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                Navigator.pop(context, selectedAddOns);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: Text(
                'Use Selected Add-ons (${selectedAddOns.length})',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
