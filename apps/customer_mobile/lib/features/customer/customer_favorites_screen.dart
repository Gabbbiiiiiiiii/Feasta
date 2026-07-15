import 'package:flutter/material.dart';

import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../shared/widgets/loading_skeleton.dart';
import 'provider_profile_screen.dart';

class CustomerFavoritesScreen extends StatelessWidget {
  const CustomerFavoritesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final FeastaRepository repository = FeastaRepository();

    return SafeArea(
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'Favorites',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          automaticallyImplyLeading: false,
        ),
        body: StreamBuilder<List<ProviderModel>>(
          stream: repository.favoriteProviders(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const FeastaSkeletonList(
                itemCount: 4,
                padding: EdgeInsets.all(20),
                showLeading: false,
                showTrailing: false,
                showImage: true,
                imageHeight: 180,
              );
            }

            if (snapshot.hasError) {
              return Center(
                child: Text('Error: ${snapshot.error}'),
              );
            }

            final providers = snapshot.data ?? [];

            if (providers.isEmpty) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(28),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.favorite_border,
                        size: 80,
                        color: Colors.grey,
                      ),
                      SizedBox(height: 18),
                      Text(
                        'No favorites yet',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Save catering providers you like so you can find them easily later.',
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
              itemCount: providers.length,
              separatorBuilder: (_, __) => const SizedBox(height: 16),
              itemBuilder: (context, index) {
                final provider = providers[index];

                return FavoriteProviderCard(
                  provider: provider,
                  repository: repository,
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class FavoriteProviderCard extends StatelessWidget {
  final ProviderModel provider;
  final FeastaRepository repository;

  const FavoriteProviderCard({
    super.key,
    required this.provider,
    required this.repository,
  });

  Future<void> _removeFavorite(BuildContext context) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Remove Favorite'),
          content: Text(
            'Remove ${provider.businessName} from your favorites?',
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
              child: const Text('Remove'),
            ),
          ],
        );
      },
    );

    if (confirm != true) return;

    try {
      await repository.removeFromFavorites(provider.id);

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Removed from favorites.'),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;

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

    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProviderProfileScreen(provider: provider),
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE5E7EB)),
          borderRadius: BorderRadius.circular(18),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            provider.coverImageUrl == null || provider.coverImageUrl!.isEmpty
                ? Container(
                    height: 180,
                    width: double.infinity,
                    color: Colors.grey.shade200,
                    child: const Icon(
                      Icons.image_outlined,
                      size: 60,
                      color: Colors.grey,
                    ),
                  )
                : Image.network(
                    provider.coverImageUrl!,
                    height: 180,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) {
                      return Container(
                        height: 180,
                        width: double.infinity,
                        color: Colors.grey.shade200,
                        child: const Icon(Icons.broken_image),
                      );
                    },
                  ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          provider.businessName,
                          style: const TextStyle(
                            fontSize: 21,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => _removeFavorite(context),
                        icon: const Icon(
                          Icons.favorite,
                          color: primary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(
                        Icons.star,
                        color: Colors.amber,
                        size: 22,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        '${provider.ratingAverage.toStringAsFixed(1)} (${provider.reviewCount})',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const Spacer(),
                      if (provider.isVerified)
                        const Row(
                          children: [
                            Icon(
                              Icons.verified,
                              color: Colors.green,
                              size: 18,
                            ),
                            SizedBox(width: 4),
                            Text(
                              'Verified',
                              style: TextStyle(
                                color: Colors.green,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    '₱${provider.minPrice.toStringAsFixed(0)} - ₱${provider.maxPrice.toStringAsFixed(0)}',
                    style: const TextStyle(
                      color: primary,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Icon(
                        Icons.location_on_outlined,
                        color: Colors.grey,
                        size: 20,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          provider.location,
                          style: const TextStyle(color: Colors.grey),
                        ),
                      ),
                      const Icon(
                        Icons.chevron_right,
                        color: Colors.grey,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
