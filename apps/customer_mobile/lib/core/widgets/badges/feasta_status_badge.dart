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
            vertical: AppSpacing.xs,
          ),
          decoration: BoxDecoration(
            color: colors.background,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: AppColors.border),
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
                  softWrap: true,
                  style: AppTypography.label.copyWith(
                    color: colors.foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static _BadgeColors _colorsFor(FeastaStatusTone tone) {
    return switch (tone) {
      FeastaStatusTone.neutral => const _BadgeColors(
        background: AppColors.surfaceMuted,
        foreground: AppColors.mainText,
      ),
      FeastaStatusTone.success => const _BadgeColors(
        background: AppColors.successSubtle,
        foreground: AppColors.success,
      ),
      FeastaStatusTone.warning => const _BadgeColors(
        background: AppColors.warningSubtle,
        foreground: AppColors.warning,
      ),
      FeastaStatusTone.error => const _BadgeColors(
        background: AppColors.errorSubtle,
        foreground: AppColors.error,
      ),
      FeastaStatusTone.info => const _BadgeColors(
        background: AppColors.infoSubtle,
        foreground: AppColors.info,
      ),
    };
  }

  static IconData _iconFor(FeastaStatusTone tone) {
    return switch (tone) {
      FeastaStatusTone.neutral => Icons.circle_outlined,
      FeastaStatusTone.success => Icons.check_circle_outline_rounded,
      FeastaStatusTone.warning => Icons.schedule_rounded,
      FeastaStatusTone.error => Icons.error_outline_rounded,
      FeastaStatusTone.info => Icons.info_outline_rounded,
    };
  }
}

class _BadgeColors {
  const _BadgeColors({required this.background, required this.foreground});

  final Color background;
  final Color foreground;
}
