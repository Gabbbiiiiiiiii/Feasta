import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../shared/models/feasta_models.dart';
import 'provider_profile_screen.dart';

class CustomerProviderCollectionScreen extends StatelessWidget {
  const CustomerProviderCollectionScreen({
    required this.title,
    required this.subtitle,
    required this.stream,
    this.excludeProviderIds = const <String>{},
    super.key,
  });

  final String title;
  final String subtitle;
  final Stream<List<ProviderModel>> stream;
  final Set<String> excludeProviderIds;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.mainText,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text(
          title,
          style: AppTypography.title.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: StreamBuilder<List<ProviderModel>>(
        stream: stream,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            );
          }

          if (snapshot.hasError) {
            return const _CollectionMessage(
              icon: Icons.error_outline_rounded,
              title: 'Could not load providers',
              message: 'Check your connection and try again.',
            );
          }

          final providers = (snapshot.data ?? const <ProviderModel>[])
              .where((provider) => !excludeProviderIds.contains(provider.id))
              .toList(growable: false);

          if (providers.isEmpty) {
            return const _CollectionMessage(
              icon: Icons.storefront_outlined,
              title: 'No providers available yet',
              message: 'More verified providers will appear here.',
            );
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screen,
              AppSpacing.md,
              AppSpacing.screen,
              AppSpacing.xxl,
            ),
            children: [
              Text(
                subtitle,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              ...providers.map(
                (provider) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: _CollectionProviderCard(provider: provider),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CollectionProviderCard extends StatelessWidget {
  const _CollectionProviderCard({required this.provider});

  final ProviderModel provider;

  @override
  Widget build(BuildContext context) {
    final imageUrl = provider.coverImageUrl?.trim() ?? '';

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.card),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ProviderProfileScreen(provider: provider),
            ),
          );
        },
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 118,
                height: 118,
                child: imageUrl.isEmpty
                    ? Container(
                        color: AppColors.primarySubtle,
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.storefront_outlined,
                          color: AppColors.primary,
                          size: 32,
                        ),
                      )
                    : Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => Container(
                          color: AppColors.primarySubtle,
                          alignment: Alignment.center,
                          child: const Icon(
                            Icons.storefront_outlined,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              provider.businessName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.cardTitle.copyWith(
                                color: AppColors.mainText,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          if (provider.isApproved)
                            const Icon(
                              Icons.verified_rounded,
                              size: 18,
                              color: AppColors.success,
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _providerCategoryLabel(provider),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Row(
                        children: [
                          const Icon(
                            Icons.star_rounded,
                            color: Colors.amber,
                            size: 17,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            '${provider.ratingAverage.toStringAsFixed(1)} '
                            '(${provider.reviewCount})',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.mainText,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        provider.location,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(right: AppSpacing.sm),
                child: Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CollectionMessage extends StatelessWidget {
  const _CollectionMessage({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: AppColors.primary),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: AppTypography.title.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _providerCategoryLabel(ProviderModel provider) {
  final raw = provider.providerCategory.trim();

  if (raw.isEmpty) {
    return provider.providerServiceType == 'catering'
        ? 'Catering Service'
        : 'Event Service';
  }

  return raw
      .replaceAll('_', ' ')
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map(
        (part) => '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}',
      )
      .join(' ');
}
