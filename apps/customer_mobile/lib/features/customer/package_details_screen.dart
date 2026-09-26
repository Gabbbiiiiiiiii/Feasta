import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/helpers/auth_guard.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_shadows.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'event_customization_screen.dart';

class PackageDetailsScreen extends StatefulWidget {
  const PackageDetailsScreen({
    required this.provider,
    required this.eventPackage,
    super.key,
  });

  final ProviderModel provider;
  final PackageModel eventPackage;

  @override
  State<PackageDetailsScreen> createState() => _PackageDetailsScreenState();
}

class _PackageDetailsScreenState extends State<PackageDetailsScreen> {
  final FeastaRepository _repository = FeastaRepository();

  bool _isUpdatingFavorite = false;

  ProviderModel get provider => widget.provider;

  PackageModel get eventPackage => widget.eventPackage;

  Future<void> _toggleFavorite(bool isFavorite) async {
    if (_isUpdatingFavorite) {
      return;
    }

    if (isGuestUser) {
      await requireLogin(
        context,
        message:
            'Please log in or create an account to add this provider to favorites.',
      );

      return;
    }

    setState(() {
      _isUpdatingFavorite = true;
    });

    try {
      if (isFavorite) {
        await _repository.removeFromFavorites(provider.id);
      } else {
        await _repository.addToFavorites(provider: provider);
      }

      if (!mounted) {
        return;
      }

      FeastaSnackbars.show(
        context,
        message: isFavorite ? 'Removed from favorites.' : 'Added to favorites.',
        tone: FeastaSnackbarTone.success,
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      FeastaSnackbars.show(
        context,
        message: error.toString().replaceFirst('Exception: ', ''),
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

  Future<void> _customizeEvent() async {
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

    if (!mounted) {
      return;
    }

    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => nextScreen),
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
              child: _PackageHero(
                provider: provider,
                eventPackage: eventPackage,
                repository: _repository,
                isUpdatingFavorite: _isUpdatingFavorite,
                onToggleFavorite: _toggleFavorite,
              ),
            ),
            SliverToBoxAdapter(
              child: _PackageOverviewCard(
                provider: provider,
                eventPackage: eventPackage,
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screen,
                AppSpacing.xs,
                AppSpacing.screen,
                AppSpacing.xl,
              ),
              sliver: SliverList.list(
                children: [
                  if (eventPackage.description.trim().isNotEmpty) ...[
                    _PackageSectionCard(
                      title: 'About this package',
                      icon: Icons.description_outlined,
                      child: Text(
                        eventPackage.description.trim(),
                        style: AppTypography.body.copyWith(
                          color: AppColors.secondaryTextAccessible,
                          height: 1.55,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  InclusionSection(
                    icon: Icons.restaurant_rounded,
                    title: 'Food Inclusions',
                    items: eventPackage.foodInclusions,
                  ),
                  if (eventPackage.foodInclusions.isNotEmpty)
                    const SizedBox(height: AppSpacing.md),
                  InclusionSection(
                    icon: Icons.auto_awesome_rounded,
                    title: 'Decoration & Setup',
                    items: eventPackage.decorInclusions,
                  ),
                  if (eventPackage.decorInclusions.isNotEmpty)
                    const SizedBox(height: AppSpacing.md),
                  InclusionSection(
                    icon: Icons.chair_outlined,
                    title: 'Tables & Chairs',
                    items: eventPackage.furnitureInclusions,
                  ),
                  if (eventPackage.furnitureInclusions.isNotEmpty)
                    const SizedBox(height: AppSpacing.md),
                  InclusionSection(
                    icon: Icons.room_service_outlined,
                    title: 'Service Inclusions',
                    items: eventPackage.serviceInclusions,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _AvailableAddonsSection(
                    providerId: provider.id,
                    repository: _repository,
                  ),
                  const SizedBox(height: 120),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _PackageBottomAction(
        price: eventPackage.price,
        onPressed: _customizeEvent,
      ),
    );
  }
}

class _PackageHero extends StatelessWidget {
  const _PackageHero({
    required this.provider,
    required this.eventPackage,
    required this.repository,
    required this.isUpdatingFavorite,
    required this.onToggleFavorite,
  });

  final ProviderModel provider;
  final PackageModel eventPackage;
  final FeastaRepository repository;

  final bool isUpdatingFavorite;

  final Future<void> Function(bool isFavorite) onToggleFavorite;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 310,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _PackageHeroImage(
            imageUrl: eventPackage.imageUrl,
            packageName: eventPackage.name,
          ),
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
            child: _FloatingPackageButton(
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
                ? _PackageFavoriteButton(
                    isFavorite: false,
                    isLoading: false,
                    onPressed: () {
                      requireLogin(
                        context,
                        message:
                            'Please log in or create an account to add this provider to favorites.',
                      );
                    },
                  )
                : StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    stream: repository.myFavorites(),
                    builder: (context, snapshot) {
                      final docs =
                          snapshot.data?.docs ??
                          const <QueryDocumentSnapshot<Map<String, dynamic>>>[];

                      final isFavorite = docs.any(
                        (doc) =>
                            doc.data()['providerId']?.toString() == provider.id,
                      );

                      return _PackageFavoriteButton(
                        isFavorite: isFavorite,
                        isLoading:
                            isUpdatingFavorite ||
                            snapshot.connectionState == ConnectionState.waiting,
                        onPressed: () {
                          onToggleFavorite(isFavorite);
                        },
                      );
                    },
                  ),
          ),
          Positioned(
            left: AppSpacing.screen,
            right: AppSpacing.screen,
            bottom: AppSpacing.lg,
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: AppSpacing.xs,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.46),
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                    child: Text(
                      provider.businessName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.label.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
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

class _PackageHeroImage extends StatelessWidget {
  const _PackageHeroImage({required this.imageUrl, required this.packageName});

  final String? imageUrl;
  final String packageName;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();

    if (url == null || url.isEmpty) {
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
      url,
      fit: BoxFit.cover,
      semanticLabel: '$packageName package image',
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

class _FloatingPackageButton extends StatelessWidget {
  const _FloatingPackageButton({
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

class _PackageFavoriteButton extends StatelessWidget {
  const _PackageFavoriteButton({
    required this.isFavorite,
    required this.isLoading,
    required this.onPressed,
  });

  final bool isFavorite;
  final bool isLoading;
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
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: isLoading ? null : onPressed,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: isLoading
                  ? const SizedBox(
                      width: 19,
                      height: 19,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.primary,
                      ),
                    )
                  : Icon(
                      isFavorite
                          ? Icons.favorite_rounded
                          : Icons.favorite_border_rounded,
                      color: isFavorite
                          ? AppColors.primary
                          : AppColors.mainText,
                      size: 24,
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PackageOverviewCard extends StatelessWidget {
  const _PackageOverviewCard({
    required this.provider,
    required this.eventPackage,
  });

  final ProviderModel provider;
  final PackageModel eventPackage;

  @override
  Widget build(BuildContext context) {
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
                  Expanded(
                    child: Text(
                      eventPackage.name,
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
              Row(
                children: [
                  const Icon(
                    Icons.storefront_outlined,
                    size: AppSizes.iconMedium,
                    color: AppColors.secondaryTextAccessible,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: Text(
                      provider.businessName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  _PackageInfoPill(
                    icon: Icons.people_outline_rounded,
                    label: '${eventPackage.guestCapacity} guests',
                  ),
                  _PackageInfoPill(
                    icon: Icons.payments_outlined,
                    label:
                        '${eventPackage.downPaymentPercentage.toStringAsFixed(0)}% down payment',
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              Text(
                'Package price',
                style: AppTypography.caption.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              FeastaPriceText(
                amount: eventPackage.price,
                decimalDigits: 0,
                semanticLabel: 'Package price',
                style: AppTypography.pageTitle.copyWith(
                  color: AppColors.primaryStrong,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.primarySubtle,
                  borderRadius: BorderRadius.circular(AppRadius.large),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.account_balance_wallet_outlined,
                      color: AppColors.primaryStrong,
                      size: AppSizes.iconMedium,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Required down payment',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.secondaryTextAccessible,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xxs),
                          FeastaPriceText(
                            amount: eventPackage.downPaymentAmount,
                            decimalDigits: 0,
                            semanticLabel: 'Required down payment',
                            style: AppTypography.cardTitle.copyWith(
                              color: AppColors.primaryStrong,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${eventPackage.downPaymentPercentage.toStringAsFixed(0)}% of the package price',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.secondaryTextAccessible,
                            ),
                          ),
                        ],
                      ),
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

class _PackageInfoPill extends StatelessWidget {
  const _PackageInfoPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: AppSizes.iconSmall,
            color: AppColors.secondaryTextAccessible,
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: AppTypography.caption.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _PackageSectionCard extends StatelessWidget {
  const _PackageSectionCard({
    required this.title,
    required this.icon,
    required this.child,
  });

  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.primarySubtle,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: Icon(
                  icon,
                  color: AppColors.primaryStrong,
                  size: AppSizes.iconMedium,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  title,
                  style: AppTypography.sectionTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          child,
        ],
      ),
    );
  }
}

class InclusionSection extends StatelessWidget {
  const InclusionSection({
    required this.icon,
    required this.title,
    required this.items,
    super.key,
  });

  final IconData icon;
  final String title;
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SizedBox.shrink();
    }

    return _PackageSectionCard(
      icon: icon,
      title: title,
      child: Column(
        children: [
          for (var index = 0; index < items.length; index++) ...[
            _InclusionRow(text: items[index]),
            if (index != items.length - 1)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Divider(height: 1, color: AppColors.border),
              ),
          ],
        ],
      ),
    );
  }
}

class _InclusionRow extends StatelessWidget {
  const _InclusionRow({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.successSubtle,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.check_rounded,
            color: AppColors.success,
            size: 17,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Text(
              text,
              style: AppTypography.body.copyWith(
                color: AppColors.mainText,
                height: 1.4,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _AvailableAddonsSection extends StatelessWidget {
  const _AvailableAddonsSection({
    required this.providerId,
    required this.repository,
  });

  final String providerId;
  final FeastaRepository repository;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<AddonModel>>(
      stream: repository.addonsByProvider(providerId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const FeastaSkeletonPulse(
            child: Column(
              children: [
                FeastaSkeletonBox(height: 96, radius: AppRadius.large),
                SizedBox(height: AppSpacing.sm),
                FeastaSkeletonBox(height: 96, radius: AppRadius.large),
              ],
            ),
          );
        }

        if (snapshot.hasError) {
          return const _PackageSectionCard(
            icon: Icons.add_circle_outline_rounded,
            title: 'Available Add-ons',
            child: Text(
              'Add-ons could not be loaded right now.',
              style: TextStyle(color: AppColors.secondaryTextAccessible),
            ),
          );
        }

        final addons = snapshot.data ?? const <AddonModel>[];

        if (addons.isEmpty) {
          return const SizedBox.shrink();
        }

        return _PackageSectionCard(
          icon: Icons.add_circle_outline_rounded,
          title: 'Available Add-ons',
          child: Column(
            children: [
              for (var index = 0; index < addons.length; index++) ...[
                _AddonRow(addon: addons[index]),
                if (index != addons.length - 1)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
                    child: Divider(height: 1, color: AppColors.border),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _AddonRow extends StatelessWidget {
  const _AddonRow({required this.addon});

  final AddonModel addon;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.medium),
          ),
          child: const Icon(
            Icons.add_rounded,
            color: AppColors.primaryStrong,
            size: AppSizes.iconMedium,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                addon.name,
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                addon.category,
                style: AppTypography.caption.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '+',
              style: AppTypography.caption.copyWith(
                color: AppColors.primaryStrong,
                fontWeight: FontWeight.w800,
              ),
            ),
            FeastaPriceText(
              amount: addon.price,
              decimalDigits: 0,
              semanticLabel: '${addon.name} add-on price',
              style: AppTypography.label.copyWith(
                color: AppColors.primaryStrong,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _PackageBottomAction extends StatelessWidget {
  const _PackageBottomAction({required this.price, required this.onPressed});

  final double price;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.border)),
        boxShadow: AppShadows.navigation,
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              flex: 4,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Package price',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                  const SizedBox(height: 2),
                  FeastaPriceText(
                    amount: price,
                    decimalDigits: 0,
                    semanticLabel: 'Package price',
                    style: AppTypography.cardTitle.copyWith(
                      color: AppColors.primaryStrong,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              flex: 6,
              child: FeastaPrimaryButton(
                label: 'Customize Event',
                icon: const Icon(Icons.tune_rounded),
                onPressed: onPressed,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
