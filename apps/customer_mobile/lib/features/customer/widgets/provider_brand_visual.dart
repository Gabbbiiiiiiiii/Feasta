import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radius.dart';
import '../../../shared/models/feasta_models.dart';

const customerDecorativeIconColor = Color(0xFF202525);

/// A bounded cover with a separate, uncropped business logo.
class ProviderBrandVisual extends StatelessWidget {
  const ProviderBrandVisual({
    super.key,
    required this.provider,
    this.height = 168,
    this.logoSize = 52,
    this.showVerification = false,
  });
  final ProviderModel provider;
  final double height;
  final double logoSize;
  final bool showVerification;

  @override
  Widget build(BuildContext context) {
    final cover = provider.coverImageUrl?.trim() ?? '';
    Widget fallback() => const ColoredBox(
      color: AppColors.surfaceMuted,
      child: Center(
        child: Icon(
          Icons.storefront_outlined,
          color: customerDecorativeIconColor,
          size: 32,
        ),
      ),
    );
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (cover.isEmpty)
            fallback()
          else
            Image.network(
              cover,
              fit: BoxFit.cover,
              semanticLabel: '${provider.businessName} cover image',
              errorBuilder: (_, _, _) => fallback(),
            ),
          Positioned(
            left: 10,
            bottom: 10,
            child: ProviderLogoBadge(provider: provider, size: logoSize),
          ),
          if (showVerification && provider.isApproved)
            const Positioned(
              right: 8,
              top: 8,
              child: Tooltip(
                message: 'Verified provider',
                child: CircleAvatar(
                  radius: 14,
                  backgroundColor: AppColors.surface,
                  child: Icon(
                    Icons.verified_rounded,
                    size: 18,
                    color: AppColors.success,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class ProviderLogoBadge extends StatelessWidget {
  const ProviderLogoBadge({super.key, required this.provider, this.size = 76});
  final ProviderModel provider;
  final double size;

  @override
  Widget build(BuildContext context) {
    final logo = provider.logoUrl?.trim() ?? '';
    Widget fallback() => Icon(
      Icons.storefront_outlined,
      color: customerDecorativeIconColor,
      size: size * 0.46,
      semanticLabel: '${provider.businessName} logo unavailable',
    );
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.medium),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x18000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.small),
        child: logo.isEmpty
            ? fallback()
            : Image.network(
                logo,
                fit: BoxFit.contain,
                semanticLabel: '${provider.businessName} logo',
                errorBuilder: (_, _, _) => fallback(),
              ),
      ),
    );
  }
}
