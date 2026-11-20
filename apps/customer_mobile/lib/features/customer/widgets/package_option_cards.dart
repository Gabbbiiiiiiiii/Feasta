import 'package:flutter/material.dart';
import '../../../core/helpers/booking_preparation.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';
import '../../../shared/models/feasta_models.dart';

class ServiceOptionCards extends StatelessWidget {
  const ServiceOptionCards({
    required this.package,
    this.selected,
    this.onSelected,
    this.readOnly = false,
    this.compact = false,
    super.key,
  });
  final PackageModel package;
  final String? selected;
  final ValueChanged<String>? onSelected;
  final bool readOnly;
  final bool compact;
  @override
  Widget build(BuildContext context) {
    final services = preparationServices(package);

    final pricedTiers = services.entries.where((entry) {
      final price = entry.value['price'];
      return price is num && knownPreparationPrice(price);
    }).toList();

    String? premiumTier;

    if (services.isNotEmpty && pricedTiers.length == services.length) {
      final highestPrice = pricedTiers
          .map((entry) => (entry.value['price'] as num).toDouble())
          .reduce((a, b) => a > b ? a : b);

      final highestTiers = pricedTiers
          .where(
            (entry) => (entry.value['price'] as num).toDouble() == highestPrice,
          )
          .toList();

      if (highestTiers.length == 1) {
        premiumTier = highestTiers.single.key;
      }
    }

    return Column(
      children: [
        for (final entry in services.entries)
          Padding(
            padding: EdgeInsets.only(bottom: compact ? 8 : 12),
            child: _OptionCard(
              compact: compact,
              selected: !readOnly && selected == entry.key,
              onTap: readOnly || onSelected == null
                  ? null
                  : () => onSelected!(entry.key),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (premiumTier == entry.key)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 6),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Chip(
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                          labelPadding: EdgeInsets.symmetric(horizontal: 2),
                          avatar: Icon(
                            Icons.workspace_premium_outlined,
                            size: 14,
                          ),
                          label: Text(
                            'Premium Tier',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  Text(
                    serviceOptionTitle(entry.key, entry.value),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: compact ? AppColors.primaryStrong : null,
                      fontWeight: compact ? FontWeight.w700 : null,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(canonicalServiceTierDescription(entry.key)),
                  SizedBox(height: compact ? 6 : 10),
                  if (compact)
                    Wrap(
                      spacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          entry.value['price'] is num &&
                                  knownPreparationPrice(
                                    entry.value['price'] as num,
                                  )
                              ? FeastaPriceFormatter.format(
                                  entry.value['price'] as num,
                                )
                              : 'Published price unavailable',
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: AppColors.primaryStrong,
                          ),
                        ),
                        if (package.pricingModel != null)
                          Text(package.priceUnitLabel),
                      ],
                    )
                  else ...[
                    Text(
                      entry.value['price'] is num &&
                              knownPreparationPrice(entry.value['price'] as num)
                          ? FeastaPriceFormatter.format(
                              entry.value['price'] as num,
                            )
                          : 'Published price unavailable',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    if (package.pricingModel != null)
                      Text(
                        package.pricingModel == 'per_pax'
                            ? 'Per guest'
                            : 'Fixed bundle',
                      ),
                  ],
                  for (final item in {
                    ...preparationInclusions(
                      package,
                      'serviceInclusions',
                      entry.key,
                    ),
                    ...preparationInclusions(
                      package,
                      'decorInclusions',
                      entry.key,
                    ),
                    ...preparationInclusions(
                      package,
                      'furnitureInclusions',
                      entry.key,
                    ),
                    ...preparationInclusions(
                      package,
                      'equipmentInclusions',
                      entry.key,
                    ),
                  })
                    if (item.trim().isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.check,
                              size: 18,
                              color: AppColors.primary,
                            ),
                            const SizedBox(width: 8),
                            Expanded(child: Text(item)),
                          ],
                        ),
                      ),
                  if (!readOnly) ...[
                    const SizedBox(height: 10),
                    Text(
                      selected == entry.key ? 'Selected' : 'Choose',
                      style: const TextStyle(
                        color: AppColors.primaryStrong,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }
}

String canonicalServiceTierDescription(String tier) {
  switch (tier) {
    case 'drop_off':
      return 'Package delivery without buffet setup or on-site service staff.';
    case 'buffet_setup':
      return 'Food delivery with provider-defined buffet equipment and setup.';
    case 'full_service':
      return 'Catering with provider-defined setup, staffing, and event service.';
    default:
      return '';
  }
}

String? themeReferenceImage(Map<String, dynamic> theme) {
  final images = theme['imageUrls'];
  if (images is List) {
    for (final image in images) {
      if (image is String && image.trim().isNotEmpty) return image.trim();
    }
  }
  final image = theme['imageUrl'];
  return image is String && image.trim().isNotEmpty ? image.trim() : null;
}

class PackageThemeCards extends StatelessWidget {
  const PackageThemeCards({
    required this.package,
    this.selected,
    this.onSelected,
    super.key,
  });
  final PackageModel package;
  final String? selected;
  final ValueChanged<String>? onSelected;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (final theme in preparationThemes(package))
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _OptionCard(
            themeCard: true,
            selected: selected == theme['id'],
            onTap: onSelected == null
                ? null
                : () => onSelected!(theme['id'] as String),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: FeastaImage.network(
                    imageUrl: themeReferenceImage(theme),
                    description: '${theme['name']} theme reference',
                    fallbackLabel: 'Theme image unavailable',
                    compactFallback: true,
                    height: 64,
                    width: 64,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        theme['name'] as String,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      if ((theme['description'] ?? '')
                          .toString()
                          .trim()
                          .isNotEmpty)
                        Text(theme['description'].toString()),
                    ],
                  ),
                ),
                if (onSelected != null) ...[
                  const SizedBox(width: 12),
                  ThemeSelectionIndicator(selected: selected == theme['id']),
                ],
              ],
            ),
          ),
        ),
    ],
  );
}

class ThemeSelectionIndicator extends StatelessWidget {
  const ThemeSelectionIndicator({required this.selected, super.key});
  final bool selected;
  @override
  Widget build(BuildContext context) => Icon(
    selected ? Icons.radio_button_checked : Icons.radio_button_off,
    color: selected ? AppColors.primary : AppColors.secondaryTextAccessible,
  );
}

class ThemeChoiceCard extends StatelessWidget {
  const ThemeChoiceCard({
    required this.title,
    required this.selected,
    required this.onTap,
    this.subtitle,
    super.key,
  });
  final String title;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: _OptionCard(
      themeCard: true,
      selected: selected,
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleSmall),
                if (subtitle != null) Text(subtitle!),
              ],
            ),
          ),
          const SizedBox(width: 12),
          ThemeSelectionIndicator(selected: selected),
        ],
      ),
    ),
  );
}

class _OptionCard extends StatelessWidget {
  const _OptionCard({
    required this.selected,
    required this.child,
    this.onTap,
    this.themeCard = false,
    this.compact = false,
  });
  final bool selected;
  final Widget child;
  final bool themeCard;
  final bool compact;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    button: onTap != null,
    child: Material(
      color: selected
          ? AppColors.primarySubtle
          : (themeCard ? Colors.white : AppColors.surfaceMuted),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: selected ? AppColors.primary : AppColors.border,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: EdgeInsets.all(compact ? 12 : 16),
          child: child,
        ),
      ),
    ),
  );
}

const customizationSteps = [
  'Event Details',
  'Customize package',
  'Review Booking',
];

class CustomizationProgress extends StatelessWidget {
  const CustomizationProgress({required this.step, super.key});
  final int step;
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Step ${step + 1} of 3: ${customizationSteps[step]}',
    child: Column(
      children: [
        Text(
          'Step ${step + 1} of 3 \u2014 ${customizationSteps[step]}',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            for (var i = 0; i < customizationSteps.length; i++) ...[
              if (i > 0)
                Expanded(
                  child: Container(
                    height: 2,
                    color: i <= step ? AppColors.primary : AppColors.border,
                  ),
                ),
              CircleAvatar(
                radius: 14,
                backgroundColor: i <= step
                    ? AppColors.primary
                    : AppColors.surfaceMuted,
                child: Text(
                  '${i + 1}',
                  style: TextStyle(
                    fontSize: 12,
                    color: i <= step
                        ? Colors.white
                        : AppColors.secondaryTextAccessible,
                  ),
                ),
              ),
            ],
          ],
        ),
      ],
    ),
  );
}
