import 'package:flutter/material.dart';

import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/widgets.dart';
import 'provider_profile_screen.dart';

class CustomerFavoritesScreen extends StatefulWidget {
  const CustomerFavoritesScreen({super.key});

  @override
  State<CustomerFavoritesScreen> createState() =>
      _CustomerFavoritesScreenState();
}

class _CustomerFavoritesScreenState extends State<CustomerFavoritesScreen> {
  final FeastaRepository repository = FeastaRepository();

  @override
  Widget build(BuildContext context) {
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
              return const FeastaListSkeleton(
                itemCount: 4,
                padding: EdgeInsets.all(20),
                showImage: true,
              );
            }

            if (snapshot.hasError) {
              return Center(
                child: FeastaApplicationErrorState(
                  kind: FeastaErrorKind.load,
                  message:
                      'We could not load your favorites. Please try again.',
                  onRetry: () => setState(() {}),
                ),
              );
            }

            final providers = snapshot.data ?? [];

            if (providers.isEmpty) {
              return const Center(
                child: FeastaEmptyState(
                  title: 'No favorites yet',
                  message:
                      'Save providers you like so you can find them easily later.',
                  icon: Icons.favorite_border,
                ),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: providers.length,
              separatorBuilder: (_, _) => const SizedBox(height: 16),
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

class FavoriteProviderCard extends StatefulWidget {
  final ProviderModel provider;
  final FeastaRepository repository;

  const FavoriteProviderCard({
    super.key,
    required this.provider,
    required this.repository,
  });

  @override
  State<FavoriteProviderCard> createState() => _FavoriteProviderCardState();
}

class _FavoriteProviderCardState extends State<FavoriteProviderCard> {
  bool _isRemoving = false;

  ProviderModel get provider => widget.provider;

  Future<void> _removeFavorite(BuildContext context) async {
    if (_isRemoving) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) => FeastaConfirmationDialog(
            title: 'Remove favorite?',
            message: 'Remove ${provider.businessName} from your favorites?',
            confirmLabel: 'Remove',
            isDestructive: true,
            isLoading: _isRemoving,
            onConfirm: () async {
              if (_isRemoving) return;
              setState(() => _isRemoving = true);
              setDialogState(() {});
              try {
                await widget.repository.removeFromFavorites(provider.id);
                if (!dialogContext.mounted) return;
                Navigator.of(dialogContext).pop();
                if (!context.mounted) return;
                FeastaSnackbars.show(
                  context,
                  message: 'Removed from favorites.',
                  tone: FeastaSnackbarTone.success,
                );
              } catch (_) {
                if (!dialogContext.mounted) return;
                if (mounted) setState(() => _isRemoving = false);
                setDialogState(() {});
                FeastaSnackbars.show(
                  dialogContext,
                  message: 'We could not remove this favorite. Try again.',
                  tone: FeastaSnackbarTone.error,
                );
              }
            },
          ),
        );
      },
    );
    if (mounted && _isRemoving) setState(() => _isRemoving = false);
  }

  @override
  Widget build(BuildContext context) {
    const primary = AppColors.primaryStrong;

    return Semantics(
      container: true,
      explicitChildNodes: true,
      label:
          '${provider.businessName}. Rating '
          '${provider.ratingAverage.toStringAsFixed(1)} from '
          '${provider.reviewCount} reviews. ${provider.location}.',
      child: InkWell(
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
              FeastaImage.network(
                imageUrl: provider.coverImageUrl,
                description: '${provider.businessName} cover image',
                fallbackLabel: '${provider.businessName} image unavailable',
                height: 180,
                width: double.infinity,
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
                          tooltip:
                              'Remove ${provider.businessName} from favorites',
                          onPressed: _isRemoving
                              ? null
                              : () => _removeFavorite(context),
                          icon: const Icon(Icons.favorite, color: primary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 16,
                      runSpacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.star,
                              color: Colors.amber,
                              size: 22,
                            ),
                            const SizedBox(width: 5),
                            Text(
                              '${provider.ratingAverage.toStringAsFixed(1)} (${provider.reviewCount})',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        if (provider.isApproved)
                          const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.verified,
                                color: AppColors.success,
                                size: 18,
                              ),
                              SizedBox(width: 4),
                              Text(
                                'Verified',
                                style: TextStyle(
                                  color: AppColors.success,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      '${FeastaPriceFormatter.format(provider.minPrice, decimalDigits: 0)} '
                      'to ${FeastaPriceFormatter.format(provider.maxPrice, decimalDigits: 0)}',
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
                        const Icon(Icons.chevron_right, color: Colors.grey),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
