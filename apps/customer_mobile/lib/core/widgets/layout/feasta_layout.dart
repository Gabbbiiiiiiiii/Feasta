import 'package:flutter/material.dart';

import '../../theme/app_breakpoints.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';

abstract final class FeastaResponsiveSpacing {
  static EdgeInsets pagePaddingFor(double width) {
    final horizontal = switch (AppBreakpoints.windowClassFor(width)) {
      AppWindowClass.mobile => AppSpacing.screen,
      AppWindowClass.tablet => AppSpacing.xl,
      AppWindowClass.laptop => AppSpacing.xxl,
      AppWindowClass.desktop => AppSpacing.xxxl,
      AppWindowClass.largeDesktop => AppSpacing.huge,
    };

    return EdgeInsets.symmetric(
      horizontal: horizontal,
      vertical: AppSpacing.xl,
    );
  }

  static double gapFor(double width) {
    return width >= AppBreakpoints.laptop ? AppSpacing.xl : AppSpacing.md;
  }
}

class FeastaAdaptivePadding extends StatelessWidget {
  const FeastaAdaptivePadding({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return Padding(
          padding: FeastaResponsiveSpacing.pagePaddingFor(constraints.maxWidth),
          child: child,
        );
      },
    );
  }
}

class FeastaContentContainer extends StatelessWidget {
  const FeastaContentContainer({
    required this.child,
    this.maxWidth = AppBreakpoints.desktop,
    this.useAdaptivePadding = true,
    this.alignment = Alignment.topCenter,
    super.key,
  });

  final Widget child;
  final double maxWidth;
  final bool useAdaptivePadding;
  final AlignmentGeometry alignment;

  @override
  Widget build(BuildContext context) {
    final constrained = Align(
      alignment: alignment,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: SizedBox(width: double.infinity, child: child),
      ),
    );

    if (!useAdaptivePadding) {
      return constrained;
    }

    return FeastaAdaptivePadding(child: constrained);
  }
}

class FeastaResponsiveGap extends StatelessWidget {
  const FeastaResponsiveGap({this.axis = Axis.vertical, super.key});

  final Axis axis;

  @override
  Widget build(BuildContext context) {
    final gap = FeastaResponsiveSpacing.gapFor(
      MediaQuery.sizeOf(context).width,
    );

    return SizedBox(
      width: axis == Axis.horizontal ? gap : 0,
      height: axis == Axis.vertical ? gap : 0,
    );
  }
}

/// Standard FEASTA customer-page header.
///
/// Supports an optional leading control for detail screens and an optional
/// trailing action for top-level pages. This keeps headers consistent across
/// Messages, Bookings, Account, Settings, and future customer screens.
class FeastaPageHeader extends StatelessWidget {
  const FeastaPageHeader({
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.padding,
    super.key,
  });

  final String title;
  final String? subtitle;

  final Widget? leading;
  final Widget? trailing;

  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          padding ??
          const EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.xl,
            AppSpacing.screen,
            AppSpacing.lg,
          ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (leading != null) ...[
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.sm),
              child: leading!,
            ),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTypography.pageTitle),
                if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    subtitle!,
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: AppSpacing.md),
            trailing!,
          ],
        ],
      ),
    );
  }
}
