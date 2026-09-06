import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_durations.dart';
import '../../theme/app_sizes.dart';
import '../../theme/app_spacing.dart';

enum FeastaButtonWidth { intrinsic, full }

enum _FeastaButtonKind { primary, secondary, text, destructive }

abstract class _FeastaButtonBase extends StatelessWidget {
  const _FeastaButtonBase({
    required this.label,
    required this.onPressed,
    required this.kind,
    this.isLoading = false,
    this.icon,
    this.width = FeastaButtonWidth.full,
    this.semanticLabel,
    this.loadingLabel = 'Loading',
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final Widget? icon;
  final FeastaButtonWidth width;
  final String? semanticLabel;
  final String loadingLabel;
  final _FeastaButtonKind kind;

  @override
  Widget build(BuildContext context) {
    final callback = isLoading ? null : onPressed;
    final effectiveLabel = semanticLabel ?? label;

    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    final child = AnimatedSwitcher(
      duration: reduceMotion ? AppDurations.reduced : AppDurations.fast,
      switchInCurve: AppDurations.emphasizedCurve,
      switchOutCurve: AppDurations.standardCurve,
      child: isLoading
          ? Row(
              key: const ValueKey<String>('loading'),
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox.square(
                  dimension: AppSizes.iconMedium,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: AppSpacing.xs),
                Flexible(
                  child: Text(
                    loadingLabel,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.fade,
                  ),
                ),
              ],
            )
          : Row(
              key: const ValueKey<String>('content'),
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[
                  IconTheme.merge(
                    data: const IconThemeData(size: AppSizes.iconMedium),
                    child: icon!,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                ],
                Flexible(
                  child: Text(label, textAlign: TextAlign.center, maxLines: 2),
                ),
              ],
            ),
    );

    final Widget control;

    switch (kind) {
      case _FeastaButtonKind.primary:
        control = ElevatedButton(onPressed: callback, child: child);

      case _FeastaButtonKind.secondary:
        control = OutlinedButton(onPressed: callback, child: child);

      case _FeastaButtonKind.text:
        control = TextButton(onPressed: callback, child: child);

      case _FeastaButtonKind.destructive:
        control = ElevatedButton(
          onPressed: callback,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.error,
            foregroundColor: AppColors.surface,
            disabledBackgroundColor: AppColors.disabled,
            disabledForegroundColor: AppColors.disabledForeground,
            elevation: 0,
          ),
          child: child,
        );
    }

    final button = Semantics(
      button: true,
      enabled: callback != null,
      liveRegion: isLoading,
      label: isLoading ? '$effectiveLabel, $loadingLabel' : effectiveLabel,
      onTap: callback,
      excludeSemantics: true,
      child: ConstrainedBox(
        constraints: const BoxConstraints(
          minHeight: AppSizes.minimumTouchTarget,
          minWidth: AppSizes.minimumTouchTarget,
        ),
        child: control,
      ),
    );

    if (width == FeastaButtonWidth.full) {
      return SizedBox(width: double.infinity, child: button);
    }

    return button;
  }
}

class FeastaPrimaryButton extends _FeastaButtonBase {
  const FeastaPrimaryButton({
    required super.label,
    required super.onPressed,
    super.isLoading,
    super.icon,
    super.width,
    super.semanticLabel,
    super.loadingLabel,
    super.key,
  }) : super(kind: _FeastaButtonKind.primary);
}

class FeastaSecondaryButton extends _FeastaButtonBase {
  const FeastaSecondaryButton({
    required super.label,
    required super.onPressed,
    super.isLoading,
    super.icon,
    super.width,
    super.semanticLabel,
    super.loadingLabel,
    super.key,
  }) : super(kind: _FeastaButtonKind.secondary);
}

class FeastaTextButton extends _FeastaButtonBase {
  const FeastaTextButton({
    required super.label,
    required super.onPressed,
    super.isLoading,
    super.icon,
    super.width = FeastaButtonWidth.intrinsic,
    super.semanticLabel,
    super.loadingLabel,
    super.key,
  }) : super(kind: _FeastaButtonKind.text);
}

class FeastaDestructiveButton extends _FeastaButtonBase {
  const FeastaDestructiveButton({
    required super.label,
    required super.onPressed,
    super.isLoading,
    super.icon,
    super.width,
    super.semanticLabel,
    super.loadingLabel,
    super.key,
  }) : super(kind: _FeastaButtonKind.destructive);
}
