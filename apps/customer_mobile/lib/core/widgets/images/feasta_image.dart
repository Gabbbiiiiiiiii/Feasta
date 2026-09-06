import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_radius.dart';
import '../../theme/app_sizes.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../feedback/feasta_loading.dart';

class FeastaImage extends StatelessWidget {
  const FeastaImage.network({
    required this.imageUrl,
    this.description,
    this.aspectRatio,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.fallbackLabel = 'Image unavailable',
    this.borderRadius = AppRadius.image,
    super.key,
  });

  final String? imageUrl;
  final String? description;

  final double? aspectRatio;

  final BoxFit fit;

  final double? width;
  final double? height;

  final String fallbackLabel;

  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();

    final Widget image;

    if (url == null || url.isEmpty) {
      image = FeastaImagePlaceholder(label: fallbackLabel);
    } else {
      image = Image.network(
        url,
        width: width,
        height: height,
        fit: fit,
        excludeFromSemantics: true,
        loadingBuilder: (context, child, progress) {
          if (progress == null) {
            return child;
          }

          return FeastaSkeleton(
            width: width,
            height: height ?? AppSizes.avatarLarge,
            borderRadius: borderRadius,
            semanticLabel: description == null
                ? 'Loading image'
                : 'Loading ${description!}',
          );
        },
        errorBuilder: (context, error, stackTrace) {
          return FeastaImagePlaceholder(label: fallbackLabel);
        },
      );
    }

    final rounded = ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: SizedBox(width: width, height: height, child: image),
    );

    final Widget content;

    if (aspectRatio == null) {
      content = rounded;
    } else {
      content = AspectRatio(aspectRatio: aspectRatio!, child: rounded);
    }

    if (description == null || description!.trim().isEmpty) {
      return ExcludeSemantics(child: content);
    }

    return Semantics(
      image: true,
      label: description,
      child: ExcludeSemantics(child: content),
    );
  }
}

class FeastaImagePlaceholder extends StatelessWidget {
  const FeastaImagePlaceholder({
    this.label = 'Image unavailable',
    this.icon = Icons.image_not_supported_outlined,
    super.key,
  });

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: label,
      child: ExcludeSemantics(
        child: ColoredBox(
          color: AppColors.surfaceMuted,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    icon,
                    size: AppSizes.iconLarge,
                    color: AppColors.secondaryTextAccessible,
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.caption.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
