import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_radius.dart';
import '../../theme/app_sizes.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';

enum FeastaStatusTone { neutral, success, warning, error, info }

class FeastaStatusBadge extends StatelessWidget {
  const FeastaStatusBadge({
    required this.label,
    this.tone = FeastaStatusTone.neutral,
    this.icon,
    this.semanticLabel,
    super.key,
  });

  final String label;
  final FeastaStatusTone tone;
  final IconData? icon;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = _colorsFor(tone);
    final effectiveIcon = icon ?? _iconFor(tone);

    return Semantics(
      container: true,
      label: semanticLabel ?? 'Status: $label',
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xxs,
          ),
          decoration: BoxDecoration(
            color: colors.background,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: colors.foreground),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                effectiveIcon,
                size: AppSizes.iconSmall,
                color: colors.foreground,
              ),
              const SizedBox(width: AppSpacing.xxs),
              Flexible(
                child: Text(
                  label,
                  style: AppTypography.label.copyWith(color: colors.foreground),
                  softWrap: true,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static _BadgeColors _colorsFor(FeastaStatusTone tone) => switch (tone) {
    FeastaStatusTone.neutral => const _BadgeColors(
      AppColors.surfaceMuted,
      AppColors.mainText,
    ),
    FeastaStatusTone.success => const _BadgeColors(
      AppColors.successSubtle,
      AppColors.success,
    ),
    FeastaStatusTone.warning => const _BadgeColors(
      AppColors.warningSubtle,
      AppColors.warning,
    ),
    FeastaStatusTone.error => const _BadgeColors(
      AppColors.errorSubtle,
      AppColors.error,
    ),
    FeastaStatusTone.info => const _BadgeColors(
      AppColors.infoSubtle,
      AppColors.info,
    ),
  };

  static IconData _iconFor(FeastaStatusTone tone) => switch (tone) {
    FeastaStatusTone.neutral => Icons.circle_outlined,
    FeastaStatusTone.success => Icons.check_circle_outline,
    FeastaStatusTone.warning => Icons.warning_amber_rounded,
    FeastaStatusTone.error => Icons.error_outline,
    FeastaStatusTone.info => Icons.info_outline,
  };
}

class _BadgeColors {
  const _BadgeColors(this.background, this.foreground);

  final Color background;
  final Color foreground;
}
