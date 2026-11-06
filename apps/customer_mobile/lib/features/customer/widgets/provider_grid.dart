import 'package:flutter/material.dart';
import '../../../core/helpers/provider_category_helper.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/models/feasta_models.dart';
import '../provider_profile_screen.dart';
import 'provider_brand_visual.dart';

/// Two columns, with a single-column accessibility layout for very large text.
class ProviderCardGrid extends StatelessWidget {
  const ProviderCardGrid({
    required this.itemCount,
    required this.itemBuilder,
    super.key,
  });
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final columns =
          MediaQuery.textScalerOf(context).scale(1) > 1.6 ||
              constraints.maxWidth < 270
          ? 1
          : 2;
      return Column(
        children: [
          for (var row = 0; row < itemCount; row += columns)
            Padding(
              padding: EdgeInsets.only(
                bottom: row + columns < itemCount ? 12 : 0,
              ),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var col = 0; col < columns; col++) ...[
                      if (col > 0) const SizedBox(width: 12),
                      Expanded(
                        child: row + col < itemCount
                            ? itemBuilder(context, row + col)
                            : const SizedBox(),
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      );
    },
  );
}

class ProviderGridCard extends StatelessWidget {
  const ProviderGridCard({
    required this.provider,
    required this.categoryNames,
    super.key,
  });
  final ProviderModel provider;
  final Map<String, String> categoryNames;
  @override
  Widget build(BuildContext context) => Material(
    color: AppColors.surface,
    clipBehavior: Clip.antiAlias,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(16),
      side: const BorderSide(color: AppColors.border),
    ),
    child: InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ProviderProfileScreen(provider: provider),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1.65,
            child: ProviderBrandVisual(
              provider: provider,
              height: 104,
              logoSize: 30,
              showVerification: true,
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  provider.businessName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F4C3A),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${providerCategoryLabel(provider.providerCategory, categoryNames: categoryNames)} · ${provider.location}',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    height: 1.4,
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
                const SizedBox(height: 7),
                if (provider.reviewCount > 0)
                  Row(
                    children: [
                      const Icon(
                        Icons.star_rounded,
                        color: AppColors.rating,
                        size: 15,
                      ),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Text(
                          '${provider.ratingAverage.toStringAsFixed(1)} (${provider.reviewCount})',
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.secondaryTextAccessible,
                          ),
                        ),
                      ),
                    ],
                  )
                else
                  const Text(
                    'No reviews yet',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
