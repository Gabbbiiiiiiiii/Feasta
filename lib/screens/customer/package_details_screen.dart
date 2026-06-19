import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';
import 'event_customization_screen.dart';
import '../../core/helpers/auth_guard.dart';
import '../../core/helpers/verification_guard.dart';

class PackageDetailsScreen extends StatelessWidget {
  final ProviderModel provider;
  final PackageModel eventPackage;

  const PackageDetailsScreen({
    super.key,
    required this.provider,
    required this.eventPackage,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);
    final FeastaRepository repository = FeastaRepository();

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Stack(
                children: [
                  eventPackage.imageUrl == null || eventPackage.imageUrl!.isEmpty
                      ? Container(
                          height: 280,
                          width: double.infinity,
                          color: Colors.grey.shade300,
                          child: const Icon(
                            Icons.image_outlined,
                            size: 70,
                            color: Colors.grey,
                          ),
                        )
                      : Image.network(
                          eventPackage.imageUrl!,
                          height: 280,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) {
                            return Container(
                              height: 280,
                              width: double.infinity,
                              color: Colors.grey.shade300,
                              child: const Icon(Icons.broken_image),
                            );
                          },
                        ),
                  Positioned(
                    top: 14,
                    left: 14,
                    child: CircleAvatar(
                      backgroundColor: Colors.white,
                      child: IconButton(
                        icon: const Icon(Icons.chevron_left),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 14,
                    right: 14,
                    child: CircleAvatar(
                      backgroundColor: Colors.white,
                      child: IconButton(
                        icon: const Icon(Icons.favorite_border),
                        onPressed: () async {
                          if (isGuestUser) {
                            await requireLogin(
                              context,
                              message:
                                  'Please log in or create an account to add this provider to favorites.',
                            );
                            return;
                          }

                          try {
                            await repository.addToFavorites(provider: provider);

                            if (!context.mounted) return;

                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Provider added to favorites.'),
                              ),
                            );
                          } catch (e) {
                            if (!context.mounted) return;

                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  e.toString().replaceAll('Exception: ', ''),
                                ),
                              ),
                            );
                          }
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      eventPackage.name,
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      provider.businessName,
                      style: const TextStyle(
                        color: Colors.grey,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        const Icon(
                          Icons.people_outline,
                          color: Colors.grey,
                          size: 22,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Good for ${eventPackage.guestCapacity} guests',
                          style: const TextStyle(
                            color: Colors.grey,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Text(
                      '₱${eventPackage.price.toStringAsFixed(0)}',
                      style: const TextStyle(
                        color: primary,
                        fontSize: 34,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Down payment: ${eventPackage.downPaymentPercentage.toStringAsFixed(0)}% = ₱${eventPackage.downPaymentAmount.toStringAsFixed(0)}',
                      style: const TextStyle(
                        color: Colors.grey,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      eventPackage.description,
                      style: const TextStyle(
                        color: Colors.grey,
                        height: 1.5,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 28),
                    InclusionSection(
                      icon: Icons.restaurant,
                      title: 'Food Inclusions',
                      items: eventPackage.foodInclusions,
                    ),
                    const SizedBox(height: 24),
                    InclusionSection(
                      icon: Icons.auto_awesome,
                      title: 'Decoration & Setup',
                      items: eventPackage.decorInclusions,
                    ),
                    const SizedBox(height: 24),
                    InclusionSection(
                      icon: Icons.chair_outlined,
                      title: 'Tables & Chairs',
                      items: eventPackage.furnitureInclusions,
                    ),
                    const SizedBox(height: 24),
                    InclusionSection(
                      icon: Icons.room_service_outlined,
                      title: 'Service Inclusions',
                      items: eventPackage.serviceInclusions,
                    ),
                    const SizedBox(height: 30),
                    StreamBuilder<List<AddonModel>>(
                      stream: repository.addonsByProvider(provider.id),
                      builder: (context, snapshot) {
                        if (snapshot.connectionState ==
                            ConnectionState.waiting) {
                          return const FeastaSkeletonPulse(
                            child: Column(
                              children: [
                                FeastaSkeletonBox(height: 76, radius: 14),
                                SizedBox(height: 10),
                                FeastaSkeletonBox(height: 76, radius: 14),
                              ],
                            ),
                          );
                        }

                        final addons = snapshot.data ?? [];

                        if (addons.isEmpty) {
                          return const SizedBox.shrink();
                        }

                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Available Add-ons',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 12),
                            ...addons.map((addon) {
                              return Container(
                                margin: const EdgeInsets.only(bottom: 10),
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: const Color(0xFFE5E7EB),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.add_circle_outline,
                                      color: primary,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            addon.name,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 16,
                                            ),
                                          ),
                                          const SizedBox(height: 3),
                                          Text(
                                            addon.category,
                                            style: const TextStyle(
                                              color: Colors.grey,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Text(
                                      '+₱${addon.price.toStringAsFixed(0)}',
                                      style: const TextStyle(
                                        color: primary,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }),
                          ],
                        );
                      },
                    ),
                    const SizedBox(height: 90),
                  ],
                ),
              ),
            ),
          ],
        ),
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
            child: ElevatedButton(
              onPressed: () async {
                final nextScreen = EventCustomizationScreen(
                  provider: provider,
                  eventPackage: eventPackage,
                );

                if (isGuestUser) {
                  await requireLogin(
                    context,
                    message:
                        'Please log in or create an account to customize your event and continue booking.',
                    redirectAfterLogin: nextScreen,
                  );
                  return;
                }

                if (!context.mounted) return;

                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => nextScreen,
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text(
                'Customize Event',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class InclusionSection extends StatelessWidget {
  final IconData icon;
  final String title;
  final List<String> items;

  const InclusionSection({
    super.key,
    required this.icon,
    required this.title,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    if (items.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, color: primary),
            const SizedBox(width: 8),
            Text(
              title,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ...items.map(
          (item) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.check_circle,
                    color: Colors.green,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      item,
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}
