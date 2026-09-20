import 'package:flutter/material.dart';

import '../../core/domain/service_category.dart';
import '../../core/helpers/provider_category_helper.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_shadows.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'customer_main_screen.dart';
import 'provider_profile_screen.dart';
import 'widgets/feasta_page_back_button.dart';

class CustomerFavoritesScreen extends StatefulWidget {
  const CustomerFavoritesScreen({
    this.isGuest = false,
    this.onLogin,
    this.onBack,
    super.key,
  });

  final bool isGuest;
  final VoidCallback? onLogin;
  final VoidCallback? onBack;

  @override
  State<CustomerFavoritesScreen> createState() =>
      _CustomerFavoritesScreenState();
}

class _CustomerFavoritesScreenState extends State<CustomerFavoritesScreen> {
  final FeastaRepository repository = FeastaRepository();
  late final Future<List<ServiceCategory>> _activeServiceCategories;
  late final Future<Map<String, String>> _serviceCategoryNames;

  static String? _rememberedCategoryCode;

  String? _selectedCategoryCode = _rememberedCategoryCode;

  @override
  void initState() {
    super.initState();
    _activeServiceCategories = repository.getActiveServiceCategories();
    _serviceCategoryNames = repository.getServiceCategoryNameMap();
  }

  void _handleBack() {
    final navigator = Navigator.of(context);

    if (navigator.canPop()) {
      navigator.pop();
      return;
    }

    if (widget.onBack != null) {
      widget.onBack!();
      return;
    }

    navigator.pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => const CustomerMainScreen(initialIndex: 0),
      ),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isGuest) {
      return _GuestFavoritesState(onLogin: widget.onLogin, onBack: _handleBack);
    }

    return SafeArea(
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: FutureBuilder<List<ServiceCategory>>(
          future: _activeServiceCategories,
          builder: (context, activeCategorySnapshot) {
            final activeCategories =
                activeCategorySnapshot.data ?? const <ServiceCategory>[];

            final activeCodes = activeCategories
                .map((category) => category.code)
                .toSet();

            final selectedCategoryCode =
                activeCodes.contains(_selectedCategoryCode)
                ? _selectedCategoryCode
                : null;

            return FutureBuilder<Map<String, String>>(
              future: _serviceCategoryNames,
              builder: (context, categorySnapshot) {
                final categoryNames =
                    categorySnapshot.data ?? const <String, String>{};

                return StreamBuilder<List<ProviderModel>>(
                  stream: repository.favoriteProviders(),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const FeastaListSkeleton(
                        itemCount: 4,
                        padding: EdgeInsets.all(AppSpacing.lg),
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

                    final allProviders =
                        snapshot.data ?? const <ProviderModel>[];

                    final visibleProviders = allProviders
                        .where((provider) {
                          return _matchesCategory(
                            provider,
                            selectedCategoryCode,
                          );
                        })
                        .toList(growable: false);

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(
                            AppSpacing.screen,
                            AppSpacing.sm,
                            AppSpacing.screen,
                            AppSpacing.xs,
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              FeastaPageBackButton(
                                semanticLabel: 'Back from Favorites',
                                onPressed: _handleBack,
                              ),
                              const SizedBox(width: AppSpacing.xxs),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Favorites',
                                      style: AppTypography.title.copyWith(
                                        color: AppColors.mainText,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                    const SizedBox(height: AppSpacing.xxs),
                                    Text(
                                      '${allProviders.length} '
                                      '${allProviders.length == 1 ? 'favorite' : 'favorites'}',
                                      style: AppTypography.bodySmall.copyWith(
                                        color:
                                            AppColors.secondaryTextAccessible,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        _FavoriteFilterRail(
                          categories: activeCategories,
                          selectedCategoryCode: selectedCategoryCode,
                          onSelected: (categoryCode) {
                            if (selectedCategoryCode == categoryCode) {
                              return;
                            }

                            setState(() {
                              _selectedCategoryCode = categoryCode;
                              _rememberedCategoryCode = categoryCode;
                            });
                          },
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Expanded(
                          child: allProviders.isEmpty
                              ? const _FavoritesEmptyState()
                              : visibleProviders.isEmpty
                              ? _CategoryEmptyState(
                                  category: _selectedCategoryName(
                                    activeCategories,
                                    selectedCategoryCode,
                                  ),
                                )
                              : ListView.separated(
                                  keyboardDismissBehavior:
                                      ScrollViewKeyboardDismissBehavior.onDrag,
                                  padding: const EdgeInsets.fromLTRB(
                                    AppSpacing.screen,
                                    0,
                                    AppSpacing.screen,
                                    132,
                                  ),
                                  itemCount: visibleProviders.length,
                                  separatorBuilder: (_, _) =>
                                      const SizedBox(height: AppSpacing.md),
                                  itemBuilder: (context, index) {
                                    return FavoriteProviderCard(
                                      provider: visibleProviders[index],
                                      repository: repository,
                                      categoryNames: categoryNames,
                                    );
                                  },
                                ),
                        ),
                      ],
                    );
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _FavoriteFilterRail extends StatelessWidget {
  const _FavoriteFilterRail({
    required this.categories,
    required this.selectedCategoryCode,
    required this.onSelected,
  });

  final List<ServiceCategory> categories;
  final String? selectedCategoryCode;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        itemCount: categories.length + 1,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.xs),
        itemBuilder: (context, index) {
          final isAll = index == 0;
          final category = isAll ? null : categories[index - 1];
          final categoryCode = category?.code;
          final active = selectedCategoryCode == categoryCode;

          return ChoiceChip(
            label: Text(isAll ? 'All' : category!.name),
            selected: active,
            onSelected: (_) => onSelected(categoryCode),
            selectedColor: AppColors.primarySubtle,
            backgroundColor: AppColors.surface,
            checkmarkColor: AppColors.primaryStrong,
            side: BorderSide(
              color: active ? AppColors.primary : AppColors.border,
            ),
            labelStyle: AppTypography.caption.copyWith(
              color: active ? AppColors.primaryStrong : AppColors.mainText,
              fontWeight: FontWeight.w800,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
          );
        },
      ),
    );
  }
}

class FavoriteProviderCard extends StatefulWidget {
  const FavoriteProviderCard({
    required this.provider,
    required this.repository,
    required this.categoryNames,
    super.key,
  });

  final ProviderModel provider;
  final FeastaRepository repository;
  final Map<String, String> categoryNames;

  @override
  State<FavoriteProviderCard> createState() => _FavoriteProviderCardState();
}

class _FavoriteProviderCardState extends State<FavoriteProviderCard> {
  bool _isUpdatingFavorite = false;

  ProviderModel get provider => widget.provider;
  Map<String, String> get categoryNames => widget.categoryNames;

  Future<void> _removeFavorite() async {
    if (_isUpdatingFavorite) {
      return;
    }

    setState(() {
      _isUpdatingFavorite = true;
    });

    try {
      await widget.repository.removeFromFavorites(provider.id);

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: const Text('Removed from Favorites.'),
            action: SnackBarAction(
              label: 'Undo',
              textColor: AppColors.primary,
              onPressed: () async {
                try {
                  await widget.repository.addToFavorites(provider: provider);
                } catch (_) {
                  if (!mounted) {
                    return;
                  }

                  FeastaSnackbars.show(
                    context,
                    message: 'We could not restore this favorite. Try again.',
                    tone: FeastaSnackbarTone.error,
                  );
                }
              },
            ),
          ),
        );
    } catch (_) {
      if (!mounted) {
        return;
      }

      FeastaSnackbars.show(
        context,
        message: 'We could not remove this favorite. Try again.',
        tone: FeastaSnackbarTone.error,
      );
    } finally {
      if (mounted) {
        setState(() {
          _isUpdatingFavorite = false;
        });
      }
    }
  }

  void _openProvider() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ProviderProfileScreen(provider: provider),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final imageUrl = provider.coverImageUrl?.trim() ?? '';

    return Semantics(
      container: true,
      button: true,
      label:
          '${provider.businessName}. '
          '${_favoriteProviderCategoryLabel(provider, categoryNames)}. '
          'Rating ${provider.ratingAverage.toStringAsFixed(1)} from '
          '${provider.reviewCount} reviews. '
          'Starts at ${FeastaPriceFormatter.format(provider.minPrice, decimalDigits: 0)}. '
          '${provider.location}.',
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.card),
        child: InkWell(
          onTap: _openProvider,
          borderRadius: BorderRadius.circular(AppRadius.card),
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.card),
              border: Border.all(color: AppColors.border),
              boxShadow: AppShadows.card,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: 156,
                  width: double.infinity,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (imageUrl.isEmpty)
                        Container(
                          color: AppColors.primarySubtle,
                          alignment: Alignment.center,
                          child: const Icon(
                            Icons.storefront_outlined,
                            size: 42,
                            color: AppColors.primary,
                          ),
                        )
                      else
                        FeastaImage.network(
                          imageUrl: imageUrl,
                          description: '${provider.businessName} cover image',
                          fallbackLabel:
                              '${provider.businessName} image unavailable',
                          height: 156,
                          width: double.infinity,
                        ),
                      Positioned(
                        top: AppSpacing.sm,
                        right: AppSpacing.sm,
                        child: Material(
                          color: AppColors.surface.withValues(alpha: 0.96),
                          shape: const CircleBorder(),
                          elevation: 2,
                          child: IconButton(
                            tooltip:
                                'Remove ${provider.businessName} from Favorites',
                            onPressed: _isUpdatingFavorite
                                ? null
                                : _removeFavorite,
                            icon: _isUpdatingFavorite
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: AppColors.primary,
                                    ),
                                  )
                                : const Icon(
                                    Icons.favorite_rounded,
                                    color: AppColors.primary,
                                  ),
                          ),
                        ),
                      ),
                      if (provider.isApproved)
                        Positioned(
                          left: AppSpacing.sm,
                          bottom: AppSpacing.sm,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.sm,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.surface.withValues(alpha: 0.95),
                              borderRadius: BorderRadius.circular(
                                AppRadius.pill,
                              ),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.verified_rounded,
                                  size: 15,
                                  color: AppColors.success,
                                ),
                                SizedBox(width: 4),
                                Text(
                                  'Verified',
                                  style: TextStyle(
                                    color: AppColors.success,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        provider.businessName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.cardTitle.copyWith(
                          color: AppColors.mainText,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        _favoriteProviderCategoryLabel(provider, categoryNames),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.secondaryTextAccessible,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Row(
                        children: [
                          const Icon(
                            Icons.star_rounded,
                            size: 18,
                            color: Colors.amber,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${provider.ratingAverage.toStringAsFixed(1)} '
                            '(${provider.reviewCount})',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.mainText,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            'Starts at '
                            '${FeastaPriceFormatter.format(provider.minPrice, decimalDigits: 0)}',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.primaryStrong,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Row(
                        children: [
                          const Icon(
                            Icons.location_on_outlined,
                            size: 18,
                            color: AppColors.secondaryTextAccessible,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              provider.location,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.caption.copyWith(
                                color: AppColors.secondaryTextAccessible,
                              ),
                            ),
                          ),
                          const Icon(
                            Icons.chevron_right_rounded,
                            color: AppColors.secondaryTextAccessible,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FavoritesEmptyState extends StatelessWidget {
  const _FavoritesEmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        child: FeastaEmptyState(
          title: 'No favorites yet',
          message: 'Explore providers and tap the heart to save them here.',
          icon: Icons.favorite_border_rounded,
        ),
      ),
    );
  }
}

class _CategoryEmptyState extends StatelessWidget {
  const _CategoryEmptyState({required this.category});

  final String category;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.favorite_border_rounded,
              size: 48,
              color: AppColors.primary,
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'No favorites in this category yet',
              textAlign: TextAlign.center,
              style: AppTypography.title.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Explore $category providers and tap the heart '
              'to save them here.',
              textAlign: TextAlign.center,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
                height: 1.45,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GuestFavoritesState extends StatelessWidget {
  const _GuestFavoritesState({required this.onLogin, required this.onBack});

  final VoidCallback? onLogin;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xl,
            AppSpacing.xxl,
            AppSpacing.xl,
            AppSpacing.xl,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  FeastaPageBackButton(
                    semanticLabel: 'Back from Favorites',
                    onPressed: onBack,
                  ),
                  const SizedBox(width: AppSpacing.xxs),
                  Expanded(
                    child: Text(
                      'Favorites',
                      style: AppTypography.title.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xxl),
              const Icon(
                Icons.favorite_border_rounded,
                size: 48,
                color: AppColors.primary,
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                'Log in to view your favorites',
                style: AppTypography.title.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Save verified catering and event service providers '
                'so you can compare them and return to them later.',
                style: AppTypography.body.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              SizedBox(
                height: 50,
                child: FilledButton(
                  onPressed: onLogin,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.xl,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadius.medium),
                    ),
                  ),
                  child: Text(
                    'Log in',
                    style: AppTypography.button.copyWith(color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

bool _matchesCategory(ProviderModel provider, String? selectedCategoryCode) {
  if (selectedCategoryCode == null) {
    return true;
  }

  return provider.providerCategory.trim() == selectedCategoryCode;
}

String _favoriteProviderCategoryLabel(
  ProviderModel provider,
  Map<String, String> categoryNames,
) {
  final raw = provider.providerCategory.trim();

  if (raw.isNotEmpty) {
    return providerCategoryLabel(raw, categoryNames: categoryNames);
  }

  final serviceType = provider.providerServiceType.trim();

  if (serviceType.isNotEmpty) {
    return serviceType
        .split('_')
        .where((part) => part.isNotEmpty)
        .map((part) => '')
        .join(' ');
  }

  return 'Event Service';
}

String _selectedCategoryName(
  List<ServiceCategory> categories,
  String? selectedCategoryCode,
) {
  if (selectedCategoryCode == null) {
    return 'all';
  }

  for (final category in categories) {
    if (category.code == selectedCategoryCode) {
      return category.name;
    }
  }

  return 'this service category';
}
