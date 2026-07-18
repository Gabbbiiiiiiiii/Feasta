import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_sizes.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../buttons/feasta_buttons.dart';

class FeastaEmptyState extends StatelessWidget {
  const FeastaEmptyState({
    required this.title,
    this.message,
    this.icon = Icons.inbox_outlined,
    this.actionLabel,
    this.onAction,
    this.semanticLabel,
    super.key,
  });

  final String title;
  final String? message;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return _FeastaStateView(
      title: title,
      message: message,
      icon: icon,
      iconColor: AppColors.secondaryTextAccessible,
      actionLabel: actionLabel,
      onAction: onAction,
      semanticLabel: semanticLabel ?? 'Empty state: $title',
    );
  }
}

class FeastaErrorState extends StatelessWidget {
  const FeastaErrorState({
    required this.title,
    this.message,
    this.retryLabel = 'Try again',
    this.onRetry,
    this.semanticLabel,
    super.key,
  });

  final String title;
  final String? message;
  final String retryLabel;
  final VoidCallback? onRetry;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return _FeastaStateView(
      title: title,
      message: message,
      icon: Icons.error_outline,
      iconColor: AppColors.error,
      actionLabel: onRetry == null ? null : retryLabel,
      onAction: onRetry,
      semanticLabel: semanticLabel ?? 'Error: $title',
    );
  }
}

class _FeastaStateView extends StatelessWidget {
  const _FeastaStateView({
    required this.title,
    required this.icon,
    required this.iconColor,
    required this.semanticLabel,
    this.message,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String? message;
  final IconData icon;
  final Color iconColor;
  final String? actionLabel;
  final VoidCallback? onAction;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: semanticLabel,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ExcludeSemantics(
              child: Icon(icon, color: iconColor, size: AppSizes.avatarLarge),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              style: AppTypography.title,
              textAlign: TextAlign.center,
            ),
            if (message != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                message!,
                style: AppTypography.body.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpacing.xl),
              FeastaPrimaryButton(
                label: actionLabel!,
                onPressed: onAction,
                width: FeastaButtonWidth.intrinsic,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
