import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/helpers/auth_guard.dart';
import '../../core/helpers/provider_category_helper.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'package_details_screen.dart';
import '../presentation/widgets/provider_review_card.dart';

class ProviderProfileScreen extends StatefulWidget {
  const ProviderProfileScreen({
    required this.provider,
    this.repository,
    super.key,
  });

  final ProviderModel provider;
  final FeastaRepository? repository;

  @override
  State<ProviderProfileScreen> createState() => _ProviderProfileScreenState();
}

class _ProviderProfileScreenState extends State<ProviderProfileScreen> {
  late final FeastaRepository _repository;

  static const List<String> _tabs = ['Packages', 'Menu', 'Photos', 'Reviews'];

  @override
  void initState() {
    super.initState();

    _repository = widget.repository ?? FeastaRepository();

    _repository.incrementProviderViewCount(widget.provider.id);
  }

  int _selectedTab = 0;

  void _selectTab(int index) {
    if (_selectedTab == index) {
      return;
    }

    setState(() {
      _selectedTab = index;
    });
  }

  Future<void> _handleChat() async {
    final allowed = await requireLogin(
      context,
      message: 'Please log in or create an account to message this provider.',
    );

    if (!allowed || !mounted) {
      return;
    }

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text(
            'You can message this provider after submitting a booking request.',
          ),
        ),
      );
  }

  Future<void> _handleBookNow() async {
    if (isGuestUser) {
      await requireLogin(
        context,
        message:
            'Please log in or create an account before booking. '
            'You can browse packages first.',
      );

      return;
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _selectedTab = 0;
    });

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text('Please choose a package below to continue booking.'),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        bottom: false,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: _ProviderHero(
                provider: widget.provider,
                repository: _repository,
              ),
            ),

            SliverToBoxAdapter(
              child: _ProviderIdentitySection(
                provider: widget.provider,
                onChat: _handleChat,
                onBook: _handleBookNow,
              ),
            ),

            SliverToBoxAdapter(
              child: _ProviderTabSelector(
                tabs: _tabs,
                selectedIndex: _selectedTab,
                onSelected: _selectTab,
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.md)),

            ..._buildSelectedContent(),

            const SliverToBoxAdapter(
              child: SizedBox(height: AppSpacing.massive),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildSelectedContent() {
    switch (_selectedTab) {
      case 0:
        return [
          _ProviderPackagesSliver(
            provider: widget.provider,
            repository: _repository,
          ),
        ];

      case 1:
        return [
          SliverToBoxAdapter(
            child: ProviderMenuSection(
              providerId: widget.provider.id,
              repository: _repository,
            ),
          ),
        ];

      case 2:
        return const [
          SliverFillRemaining(hasScrollBody: false, child: _PhotosEmptyState()),
        ];

      case 3:
        return [
          _ProviderReviewsSliver(
            providerId: widget.provider.id,
            repository: _repository,
          ),
        ];

      default:
        return const [];
    }
  }
}

class _ProviderHero extends StatelessWidget {
  const _ProviderHero({required this.provider, required this.repository});

  final ProviderModel provider;
  final FeastaRepository repository;

  @override
  Widget build(BuildContext context) {
    final imageUrl = provider.coverImageUrl?.trim();

    return SizedBox(
      height: 280,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _HeroImage(imageUrl: imageUrl, businessName: provider.businessName),

          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.center,
                colors: [Color(0x66000000), Colors.transparent],
              ),
            ),
          ),

          Positioned(
            top: AppSpacing.md,
            left: AppSpacing.screen,
            child: _FloatingCircleButton(
              tooltip: 'Back',
              icon: Icons.arrow_back_rounded,
              onPressed: () {
                Navigator.pop(context);
              },
            ),
          ),

          Positioned(
            top: AppSpacing.md,
            right: AppSpacing.screen,
            child: isGuestUser
                ? _FloatingFavoriteButton(
                    isFavorite: false,
                    onPressed: () {
                      requireLogin(
                        context,
                        message:
                            'Please log in or create an account '
                            'to add providers to favorites.',
                      );
                    },
                  )
                : StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    stream: repository.myFavorites(),
                    builder: (context, snapshot) {
                      final docs = snapshot.data?.docs ?? [];

                      final isFavorite = docs.any(
                        (doc) =>
                            doc.data()['providerId']?.toString() == provider.id,
                      );

                      return _FloatingFavoriteButton(
                        isFavorite: isFavorite,
                        onPressed: () async {
                          try {
                            if (isFavorite) {
                              await repository.removeFromFavorites(provider.id);
                            } else {
                              await repository.addToFavorites(
                                provider: provider,
                              );
                            }

                            if (!context.mounted) {
                              return;
                            }

                            ScaffoldMessenger.of(context)
                              ..hideCurrentSnackBar()
                              ..showSnackBar(
                                SnackBar(
                                  content: Text(
                                    isFavorite
                                        ? 'Removed from favorites.'
                                        : 'Added to favorites.',
                                  ),
                                ),
                              );
                          } catch (error) {
                            if (!context.mounted) {
                              return;
                            }

                            ScaffoldMessenger.of(context)
                              ..hideCurrentSnackBar()
                              ..showSnackBar(
                                SnackBar(
                                  content: Text(
                                    error.toString().replaceAll(
                                      'Exception: ',
                                      '',
                                    ),
                                  ),
                                ),
                              );
                          }
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _HeroImage extends StatelessWidget {
  const _HeroImage({required this.imageUrl, required this.businessName});

  final String? imageUrl;
  final String businessName;

  @override
  Widget build(BuildContext context) {
    if (imageUrl == null || imageUrl!.isEmpty) {
      return Container(
        color: AppColors.surfaceMuted,
        alignment: Alignment.center,
        child: const Icon(
          Icons.image_outlined,
          size: 64,
          color: AppColors.secondaryTextAccessible,
        ),
      );
    }

    return Image.network(
      imageUrl!,
      fit: BoxFit.cover,
      semanticLabel: '$businessName cover image',
      loadingBuilder: (context, child, progress) {
        if (progress == null) {
          return child;
        }

        return Container(
          color: AppColors.surfaceMuted,
          alignment: Alignment.center,
          child: const CircularProgressIndicator(
            strokeWidth: 2.5,
            color: AppColors.primary,
          ),
        );
      },
      errorBuilder: (context, error, stackTrace) {
        return Container(
          color: AppColors.surfaceMuted,
          alignment: Alignment.center,
          child: const Icon(
            Icons.broken_image_outlined,
            size: 54,
            color: AppColors.secondaryTextAccessible,
          ),
        );
      },
    );
  }
}

class _FloatingCircleButton extends StatelessWidget {
  const _FloatingCircleButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface.withValues(alpha: 0.96),
      shape: const CircleBorder(),
      elevation: 3,
      child: IconButton(
        tooltip: tooltip,
        onPressed: onPressed,
        icon: Icon(icon, color: AppColors.mainText),
      ),
    );
  }
}

class _FloatingFavoriteButton extends StatelessWidget {
  const _FloatingFavoriteButton({
    required this.isFavorite,
    required this.onPressed,
  });

  final bool isFavorite;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: isFavorite
          ? 'Remove provider from favorites'
          : 'Add provider to favorites',
      child: Material(
        color: AppColors.surface.withValues(alpha: 0.96),
        shape: const CircleBorder(),
        elevation: 3,
        child: IconButton(
          tooltip: isFavorite ? 'Remove from favorites' : 'Add to favorites',
          onPressed: onPressed,
          icon: Icon(
            isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
            color: isFavorite ? AppColors.primary : AppColors.mainText,
          ),
        ),
      ),
    );
  }
}

class _ProviderIdentitySection extends StatelessWidget {
  const _ProviderIdentitySection({
    required this.provider,
    required this.onChat,
    required this.onBook,
  });

  final ProviderModel provider;
  final VoidCallback onChat;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) {
    final logoUrl = provider.logoUrl?.trim();

    return Transform.translate(
      offset: const Offset(0, -22),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        child: FeastaCard(
          padding: const EdgeInsets.all(AppSpacing.card),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _ProviderLogo(
                    imageUrl: logoUrl,
                    businessName: provider.businessName,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Text(
                                provider.businessName,
                                style: AppTypography.pageTitle.copyWith(
                                  color: AppColors.mainText,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            if (provider.isApproved) ...[
                              const SizedBox(width: AppSpacing.xs),
                              const Tooltip(
                                message: 'Verified provider',
                                child: Icon(
                                  Icons.verified_rounded,
                                  color: AppColors.success,
                                  size: 24,
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        _ProviderCategoryPill(
                          category: provider.providerCategory,
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: AppSpacing.lg),

              Wrap(
                spacing: AppSpacing.md,
                runSpacing: AppSpacing.sm,
                children: [
                  _ProviderMetaItem(
                    icon: Icons.star_rounded,
                    iconColor: Colors.amber,
                    value: provider.ratingAverage.toStringAsFixed(1),
                    label: '${provider.reviewCount} reviews',
                  ),
                  _ProviderMetaItem(
                    icon: Icons.location_on_outlined,
                    value: provider.location,
                    label: 'Location',
                  ),
                ],
              ),

              if (provider.description.trim().isNotEmpty) ...[
                const SizedBox(height: AppSpacing.lg),
                Text(
                  provider.description.trim(),
                  style: AppTypography.body.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.55,
                  ),
                ),
              ],

              const SizedBox(height: AppSpacing.xl),

              LayoutBuilder(
                builder: (context, constraints) {
                  final stack =
                      constraints.maxWidth < 340 ||
                      MediaQuery.textScalerOf(context).scale(1) > 1.25;

                  if (stack) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        FeastaSecondaryButton(
                          label: 'Chat',
                          icon: const Icon(Icons.chat_bubble_outline_rounded),
                          onPressed: onChat,
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        FeastaPrimaryButton(
                          label: 'Book Now',
                          icon: const Icon(Icons.calendar_month_rounded),
                          onPressed: onBook,
                        ),
                      ],
                    );
                  }

                  return Row(
                    children: [
                      Expanded(
                        child: FeastaSecondaryButton(
                          label: 'Chat',
                          icon: const Icon(Icons.chat_bubble_outline_rounded),
                          onPressed: onChat,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: FeastaPrimaryButton(
                          label: 'Book Now',
                          icon: const Icon(Icons.calendar_month_rounded),
                          onPressed: onBook,
                        ),
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProviderLogo extends StatelessWidget {
  const _ProviderLogo({required this.imageUrl, required this.businessName});

  final String? imageUrl;
  final String businessName;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 76,
      height: 76,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: imageUrl == null || imageUrl!.isEmpty
          ? const Icon(
              Icons.storefront_rounded,
              color: AppColors.primaryStrong,
              size: 34,
            )
          : Image.network(
              imageUrl!,
              fit: BoxFit.cover,
              semanticLabel: '$businessName logo',
              errorBuilder: (context, error, stackTrace) {
                return const Icon(
                  Icons.storefront_rounded,
                  color: AppColors.primaryStrong,
                  size: 34,
                );
              },
            ),
    );
  }
}

class _ProviderCategoryPill extends StatelessWidget {
  const _ProviderCategoryPill({required this.category});

  final String category;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        providerCategoryLabel(category),
        style: AppTypography.caption.copyWith(
          color: AppColors.primaryStrong,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _ProviderMetaItem extends StatelessWidget {
  const _ProviderMetaItem({
    required this.icon,
    required this.value,
    required this.label,
    this.iconColor,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: AppSizes.iconMedium,
          color: iconColor ?? AppColors.secondaryTextAccessible,
        ),
        const SizedBox(width: AppSpacing.xs),
        Text(
          value,
          style: AppTypography.label.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: AppTypography.caption.copyWith(
            color: AppColors.secondaryTextAccessible,
          ),
        ),
      ],
    );
  }
}

class _ProviderTabSelector extends StatelessWidget {
  const _ProviderTabSelector({
    required this.tabs,
    required this.selectedIndex,
    required this.onSelected,
  });

  final List<String> tabs;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        0,
        AppSpacing.screen,
        AppSpacing.xs,
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: List.generate(tabs.length, (index) {
            final selected = selectedIndex == index;

            return Padding(
              padding: EdgeInsets.only(
                right: index == tabs.length - 1 ? 0 : AppSpacing.xs,
              ),
              child: ChoiceChip(
                selected: selected,
                showCheckmark: false,
                label: Text(tabs[index]),
                onSelected: (_) {
                  onSelected(index);
                },
                backgroundColor: AppColors.surface,
                selectedColor: AppColors.primarySubtle,
                side: BorderSide(
                  color: selected ? AppColors.primary : AppColors.border,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
                labelStyle: AppTypography.label.copyWith(
                  color: selected
                      ? AppColors.primaryStrong
                      : AppColors.secondaryTextAccessible,
                  fontWeight: FontWeight.w800,
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: AppSpacing.xs,
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _ProviderPackagesSliver extends StatelessWidget {
  const _ProviderPackagesSliver({
    required this.provider,
    required this.repository,
  });

  final ProviderModel provider;
  final FeastaRepository repository;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<PackageModel>>(
      stream: repository.packagesByProvider(provider.id),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SliverToBoxAdapter(
            child: SizedBox(
              height: 500,
              child: FeastaSkeletonList(
                itemCount: 3,
                padding: EdgeInsets.all(AppSpacing.screen),
                showLeading: false,
                showTrailing: false,
                showImage: true,
                imageHeight: 180,
              ),
            ),
          );
        }

        if (snapshot.hasError) {
          return const SliverFillRemaining(
            hasScrollBody: false,
            child: FeastaApplicationErrorState(
              kind: FeastaErrorKind.load,
              message: 'We couldn\'t load this provider\'s packages.',
            ),
          );
        }

        final packages = snapshot.data ?? const <PackageModel>[];

        if (packages.isEmpty) {
          return const SliverFillRemaining(
            hasScrollBody: false,
            child: FeastaEmptyState(
              icon: Icons.inventory_2_outlined,
              title: 'No packages yet',
              message: 'This provider has not published any packages yet.',
            ),
          );
        }

        return SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.xs,
            AppSpacing.screen,
            AppSpacing.xl,
          ),
          sliver: SliverList.separated(
            itemCount: packages.length,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, index) {
              return PackageCard(
                eventPackage: packages[index],
                provider: provider,
              );
            },
          ),
        );
      },
    );
  }
}

class PackageCard extends StatelessWidget {
  const PackageCard({
    required this.eventPackage,
    required this.provider,
    super.key,
  });

  final PackageModel eventPackage;
  final ProviderModel provider;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: EdgeInsets.zero,
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PackageDetailsScreen(
              provider: provider,
              eventPackage: eventPackage,
            ),
          ),
        );
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppRadius.card),
            ),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: FeastaImage.network(
                imageUrl: eventPackage.imageUrl,
                description: '${eventPackage.name} package image',
                fallbackLabel: '${eventPackage.name} image unavailable',
                width: double.infinity,
                borderRadius: 0,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.card),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        eventPackage.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.sectionTitle.copyWith(
                          color: AppColors.mainText,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    const Icon(
                      Icons.people_outline_rounded,
                      color: AppColors.secondaryTextAccessible,
                      size: AppSizes.iconMedium,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Text(
                        'Good for ${eventPackage.guestCapacity} guests',
                        style: AppTypography.bodySmall.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                FeastaPriceText(
                  amount: eventPackage.price,
                  decimalDigits: 0,
                  style: AppTypography.sectionTitle.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ProviderMenuSection extends StatelessWidget {
  const ProviderMenuSection({
    required this.providerId,
    required this.repository,
    super.key,
  });

  final String providerId;
  final FeastaRepository repository;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<MenuItemModel>>(
      stream: repository.menuItemsByProvider(providerId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox(
            height: 400,
            child: FeastaSkeletonList(
              itemCount: 3,
              padding: EdgeInsets.all(AppSpacing.screen),
              showLeading: false,
              showTrailing: false,
            ),
          );
        }

        if (snapshot.hasError) {
          return const Padding(
            padding: EdgeInsets.all(AppSpacing.screen),
            child: FeastaApplicationErrorState(
              kind: FeastaErrorKind.load,
              message: 'We couldn\'t load this provider\'s menu.',
            ),
          );
        }

        final items = snapshot.data ?? const <MenuItemModel>[];

        if (items.isEmpty) {
          return const Padding(
            padding: EdgeInsets.symmetric(
              horizontal: AppSpacing.screen,
              vertical: AppSpacing.massive,
            ),
            child: FeastaEmptyState(
              icon: Icons.restaurant_menu_rounded,
              title: 'No menu items yet',
              message: 'This provider has not published menu items yet.',
            ),
          );
        }

        return ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.xs,
            AppSpacing.screen,
            AppSpacing.xl,
          ),
          itemCount: items.length,
          separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
          itemBuilder: (context, index) {
            return _MenuItemCard(item: items[index]);
          },
        );
      },
    );
  }
}

class _MenuItemCard extends StatelessWidget {
  const _MenuItemCard({required this.item});

  final MenuItemModel item;

  @override
  Widget build(BuildContext context) {
    final imageUrl = item.imageUrl?.trim();

    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.large),
            child: SizedBox(
              width: 92,
              height: 92,
              child: imageUrl != null && imageUrl.isNotEmpty
                  ? Image.network(
                      imageUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) {
                        return _MenuImageFallback();
                      },
                    )
                  : const _MenuImageFallback(),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  item.category,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (item.description.trim().isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    item.description,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                      height: 1.4,
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.sm),
                FeastaPriceText(
                  amount: item.pricePerServing,
                  decimalDigits: 0,
                  semanticLabel: 'Price per serving',
                  style: AppTypography.label.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  'per serving',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuImageFallback extends StatelessWidget {
  const _MenuImageFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.primarySubtle,
      alignment: Alignment.center,
      child: const Icon(
        Icons.restaurant_menu_rounded,
        color: AppColors.primaryStrong,
        size: 32,
      ),
    );
  }
}

class _ProviderReviewsSliver extends StatelessWidget {
  const _ProviderReviewsSliver({
    required this.providerId,
    required this.repository,
  });

  final String providerId;
  final FeastaRepository repository;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: repository.providerReviews(providerId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SliverToBoxAdapter(
            child: SizedBox(
              height: 400,
              child: FeastaSkeletonList(
                itemCount: 3,
                padding: EdgeInsets.all(AppSpacing.screen),
              ),
            ),
          );
        }

        if (snapshot.hasError) {
          return const SliverFillRemaining(
            hasScrollBody: false,
            child: FeastaApplicationErrorState(
              kind: FeastaErrorKind.load,
              message: 'We couldn\'t load this provider\'s reviews.',
            ),
          );
        }

        final reviews = snapshot.data?.docs ?? [];

        if (reviews.isEmpty) {
          return const SliverFillRemaining(
            hasScrollBody: false,
            child: FeastaEmptyState(
              icon: Icons.rate_review_outlined,
              title: 'No reviews yet',
              message:
                  'Customer reviews will appear here after completed bookings.',
            ),
          );
        }

        return SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.xs,
            AppSpacing.screen,
            AppSpacing.xl,
          ),
          sliver: SliverList.separated(
            itemCount: reviews.length,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
            itemBuilder: (context, index) {
              return ProviderReviewCard(data: reviews[index].data());
            },
          ),
        );
      },
    );
  }
}

class _PhotosEmptyState extends StatelessWidget {
  const _PhotosEmptyState();

  @override
  Widget build(BuildContext context) {
    return const FeastaEmptyState(
      icon: Icons.photo_library_outlined,
      title: 'Photos coming soon',
      message:
          'More photos from this provider will appear here once they are available.',
    );
  }
}
