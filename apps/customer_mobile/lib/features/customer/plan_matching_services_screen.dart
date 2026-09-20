import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../shared/models/customer_address_model.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'provider_profile_screen.dart';

class PlanMatchingServicesScreen extends StatelessWidget {
  const PlanMatchingServicesScreen({
    super.key,
    required this.eventType,
    required this.address,
    required this.eventDate,
    required this.startTime,
    required this.endTime,
    required this.minBudget,
    required this.maxBudget,
    required this.guestCount,
    this.themes = const <String>[],
    this.customTheme = '',
  });

  final String eventType;
  final CustomerAddressModel address;
  final DateTime eventDate;
  final TimeOfDay startTime;
  final TimeOfDay endTime;
  final double minBudget;
  final double maxBudget;
  final int guestCount;
  final List<String> themes;
  final String customTheme;

  @override
  Widget build(BuildContext context) {
    final repository = FeastaRepository();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text(
          'Matching services',
          style: AppTypography.title.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: StreamBuilder<List<ProviderModel>>(
        stream: repository.searchAllVerifiedProviders(
          keyword: '',
          eventType: eventType,
          location: address.city,
          minBudget: minBudget,
          maxBudget: maxBudget,
        ),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            );
          }

          if (snapshot.hasError) {
            return _ResultMessage(
              icon: Icons.error_outline_rounded,
              title: 'Unable to load providers',
              message: snapshot.error.toString(),
            );
          }

          final providers = snapshot.data ?? const <ProviderModel>[];

          if (providers.isEmpty) {
            return const _ResultMessage(
              icon: Icons.search_off_rounded,
              title: 'No exact matches',
              message:
                  'Try a nearby location, another event type, or a wider budget range.',
            );
          }

          return FutureBuilder<List<ProviderModel>>(
            future: _availableProviders(
              repository: repository,
              providers: providers.where((provider) {
                return provider.maxGuestsPerEvent <= 0 ||
                    provider.maxGuestsPerEvent >= guestCount;
              }).toList(),
              eventDate: eventDate,
            ),
            builder: (context, availabilitySnapshot) {
              if (availabilitySnapshot.connectionState ==
                  ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                );
              }

              if (availabilitySnapshot.hasError) {
                return _ResultMessage(
                  icon: Icons.event_busy_outlined,
                  title: 'Availability check failed',
                  message: availabilitySnapshot.error.toString(),
                );
              }

              final available =
                  availabilitySnapshot.data ?? const <ProviderModel>[];

              if (available.isEmpty) {
                return const _ResultMessage(
                  icon: Icons.event_busy_outlined,
                  title: 'No providers available on this date',
                  message:
                      'Try another date, nearby providers, or a wider budget range.',
                );
              }

              return ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screen,
                  AppSpacing.sm,
                  AppSpacing.screen,
                  AppSpacing.xl,
                ),
                children: [
                  _SearchSummary(
                    eventType: eventType,
                    address: address,
                    eventDate: eventDate,
                    startTime: startTime,
                    endTime: endTime,
                    minBudget: minBudget,
                    maxBudget: maxBudget,
                    guestCount: guestCount,
                    themes: themes,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    '${available.length} available provider${available.length == 1 ? '' : 's'}',
                    style: AppTypography.sectionTitle.copyWith(
                      color: AppColors.mainText,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  ...available.map(
                    (provider) => Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: _AvailableProviderCard(
                        provider: provider,
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) =>
                                  ProviderProfileScreen(provider: provider),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

Future<List<ProviderModel>> _availableProviders({
  required FeastaRepository repository,
  required List<ProviderModel> providers,
  required DateTime eventDate,
}) async {
  final checks = await Future.wait(
    providers.map((provider) async {
      final available = await repository.checkProviderAvailability(
        providerId: provider.id,
        eventDate: eventDate,
        maxEventsPerDay: provider.maxEventsPerDay,
      );

      return available ? provider : null;
    }),
  );

  return checks.whereType<ProviderModel>().toList();
}

class _SearchSummary extends StatelessWidget {
  const _SearchSummary({
    required this.eventType,
    required this.address,
    required this.eventDate,
    required this.startTime,
    required this.endTime,
    required this.minBudget,
    required this.maxBudget,
    required this.guestCount,
    required this.themes,
  });

  final String eventType;
  final CustomerAddressModel address;
  final DateTime eventDate;
  final TimeOfDay startTime;
  final TimeOfDay endTime;
  final double minBudget;
  final double maxBudget;
  final int guestCount;
  final List<String> themes;

  @override
  Widget build(BuildContext context) {
    final date = '${eventDate.month}/${eventDate.day}/${eventDate.year}';
    final start = MaterialLocalizations.of(context).formatTimeOfDay(startTime);
    final end = MaterialLocalizations.of(context).formatTimeOfDay(endTime);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.16)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$eventType · $date',
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$start – $end · ${address.displayTitle}',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$guestCount guests',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (themes.isNotEmpty && !themes.contains('Not sure yet')) ...[
            const SizedBox(height: 4),
            Text(
              'Theme: ${themes.join(' · ')}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.primaryStrong,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            '₱${minBudget.toStringAsFixed(0)} – ₱${maxBudget.toStringAsFixed(0)}',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.primaryStrong,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _AvailableProviderCard extends StatelessWidget {
  const _AvailableProviderCard({required this.provider, required this.onTap});

  final ProviderModel provider;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final imageUrl = provider.coverImageUrl?.trim() ?? '';

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.large),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.large),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.large),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppRadius.large),
                ),
                child: imageUrl.isEmpty
                    ? Container(
                        height: 128,
                        width: double.infinity,
                        color: AppColors.primarySubtle,
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.storefront_outlined,
                          color: AppColors.primary,
                          size: 42,
                        ),
                      )
                    : Image.network(
                        imageUrl,
                        height: 128,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) {
                          return Container(
                            height: 128,
                            width: double.infinity,
                            color: AppColors.primarySubtle,
                            alignment: Alignment.center,
                            child: const Icon(
                              Icons.storefront_outlined,
                              color: AppColors.primary,
                              size: 42,
                            ),
                          );
                        },
                      ),
              ),
              Padding(
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
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primarySubtle,
                            borderRadius: BorderRadius.circular(AppRadius.pill),
                          ),
                          child: Text(
                            'Available',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.primaryStrong,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${provider.city}, ${provider.province}',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Icon(
                          Icons.star_rounded,
                          color: Colors.amber,
                          size: 18,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          '${provider.ratingAverage.toStringAsFixed(1)} '
                          '(${provider.reviewCount} reviews)',
                          style: AppTypography.caption.copyWith(
                            color: AppColors.mainText,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '₱${provider.minPrice.toStringAsFixed(0)} – '
                      '₱${provider.maxPrice.toStringAsFixed(0)}',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.primaryStrong,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: onTap,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primaryStrong,
                          side: const BorderSide(color: AppColors.primary),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(
                              AppRadius.large,
                            ),
                          ),
                        ),
                        child: const Text(
                          'View packages',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
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

class _ResultMessage extends StatelessWidget {
  const _ResultMessage({
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
            Icon(icon, size: 52, color: AppColors.secondaryTextAccessible),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: AppTypography.sectionTitle.copyWith(
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
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
