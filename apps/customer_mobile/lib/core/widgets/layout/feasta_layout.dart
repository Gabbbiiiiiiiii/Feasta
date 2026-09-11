import 'package:flutter/material.dart';

import '../../theme/app_breakpoints.dart';
import '../../theme/app_spacing.dart';

abstract final class FeastaResponsiveSpacing {
  static EdgeInsets pagePaddingFor(double width) {
    final horizontal = switch (AppBreakpoints.windowClassFor(width)) {
      AppWindowClass.mobile => AppSpacing.md,
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
      builder: (context, constraints) => Padding(
        padding: FeastaResponsiveSpacing.pagePaddingFor(constraints.maxWidth),
        child: child,
      ),
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
    return useAdaptivePadding
        ? FeastaAdaptivePadding(child: constrained)
        : constrained;
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
