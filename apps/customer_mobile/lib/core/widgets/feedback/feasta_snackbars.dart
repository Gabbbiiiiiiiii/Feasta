import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_sizes.dart';
import '../../theme/app_spacing.dart';

enum FeastaSnackbarTone { neutral, success, warning, error, info }

abstract final class FeastaSnackbars {
  static ScaffoldFeatureController<SnackBar, SnackBarClosedReason> show(
    BuildContext context, {
    required String message,
    FeastaSnackbarTone tone = FeastaSnackbarTone.neutral,
    String? actionLabel,
    VoidCallback? onAction,
    Duration duration = const Duration(seconds: 4),
  }) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    return messenger.showSnackBar(
      SnackBar(
        duration: duration,
        backgroundColor: _background(tone),
        content: Semantics(
          liveRegion: true,
          child: Row(
            children: [
              Icon(
                _icon(tone),
                color: AppColors.surface,
                size: AppSizes.iconMedium,
              ),
              const SizedBox(width: AppSpacing.xs),
              Expanded(child: Text(message)),
            ],
          ),
        ),
        action: actionLabel == null || onAction == null
            ? null
            : SnackBarAction(label: actionLabel, onPressed: onAction),
      ),
    );
  }

  static Color _background(FeastaSnackbarTone tone) => switch (tone) {
    FeastaSnackbarTone.neutral => AppColors.mainText,
    FeastaSnackbarTone.success => AppColors.success,
    FeastaSnackbarTone.warning => AppColors.warning,
    FeastaSnackbarTone.error => AppColors.error,
    FeastaSnackbarTone.info => AppColors.info,
  };

  static IconData _icon(FeastaSnackbarTone tone) => switch (tone) {
    FeastaSnackbarTone.neutral => Icons.notifications_none,
    FeastaSnackbarTone.success => Icons.check_circle_outline,
    FeastaSnackbarTone.warning => Icons.warning_amber_rounded,
    FeastaSnackbarTone.error => Icons.error_outline,
    FeastaSnackbarTone.info => Icons.info_outline,
  };
}
