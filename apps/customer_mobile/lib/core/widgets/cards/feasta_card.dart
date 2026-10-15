import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_radius.dart';
import '../../theme/app_shadows.dart';
import '../../theme/app_spacing.dart';

class FeastaCard extends StatelessWidget {
  const FeastaCard({
    required this.child,
    this.onTap,
    this.semanticLabel,
    this.padding = const EdgeInsets.all(AppSpacing.card),
    this.margin = EdgeInsets.zero,
    this.showBorder = false,
    this.showShadow = true,
    super.key,
  });

  final Widget child;

  final VoidCallback? onTap;

  final String? semanticLabel;

  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;

  final bool showBorder;
  final bool showShadow;

  @override
  Widget build(BuildContext context) {
    final content = Padding(padding: padding, child: child);

    final card = Card(
      margin: EdgeInsets.zero,
      elevation: 0,
      color: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
        side: showBorder
            ? const BorderSide(color: AppColors.border)
            : BorderSide.none,
      ),
      child: onTap == null
          ? content
          : InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(AppRadius.card),
              child: content,
            ),
    );

    return Semantics(
      container: true,
      explicitChildNodes: true,
      button: onTap != null,
      label: semanticLabel,
      child: Padding(
        padding: margin,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.card),
            boxShadow: showShadow ? AppShadows.card : const [],
          ),
          child: card,
        ),
      ),
    );
  }
}
