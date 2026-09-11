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
      duration: reduceMotion ? Duration.zero : AppDurations.fast,
      child: isLoading
          ? Row(
              key: const ValueKey('loading'),
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox.square(
                  dimension: AppSizes.iconMedium,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: AppSpacing.xs),
                Flexible(
                  child: Text(loadingLabel, overflow: TextOverflow.fade),
                ),
              ],
            )
          : Row(
              key: const ValueKey('content'),
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  IconTheme.merge(
                    data: const IconThemeData(size: AppSizes.iconMedium),
                    child: icon!,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                ],
                Flexible(child: Text(label, textAlign: TextAlign.center)),
              ],
            ),
    );

    final control = switch (kind) {
      _FeastaButtonKind.primary => ElevatedButton(
        onPressed: callback,
        child: child,
      ),
      _FeastaButtonKind.secondary => OutlinedButton(
        onPressed: callback,
        child: child,
      ),
      _FeastaButtonKind.text => TextButton(onPressed: callback, child: child),
      _FeastaButtonKind.destructive => ElevatedButton(
        onPressed: callback,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.error,
          foregroundColor: AppColors.surface,
          disabledBackgroundColor: AppColors.disabled,
          disabledForegroundColor: AppColors.disabledForeground,
        ),
        child: child,
      ),
    };
    final button = Semantics(
      button: true,
      enabled: callback != null,
      label: isLoading ? '$effectiveLabel, $loadingLabel' : effectiveLabel,
      liveRegion: isLoading,
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

    return width == FeastaButtonWidth.full
        ? SizedBox(width: double.infinity, child: button)
        : button;
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
