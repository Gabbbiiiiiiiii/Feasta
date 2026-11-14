import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_durations.dart';
import '../../theme/app_radius.dart';
import '../../theme/app_sizes.dart';

class FeastaLoadingIndicator extends StatelessWidget {
  const FeastaLoadingIndicator({
    this.label = 'Loading',
    this.size = AppSizes.iconLarge,
    this.strokeWidth = 3,
    this.color,
    super.key,
  });

  final String label;
  final double size;
  final double strokeWidth;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      liveRegion: true,
      child: ExcludeSemantics(
        child: SizedBox.square(
          dimension: size,
          child: CircularProgressIndicator(
            strokeWidth: strokeWidth,
            color: color,
          ),
        ),
      ),
    );
  }
}

class FeastaSkeleton extends StatefulWidget {
  const FeastaSkeleton({
    this.width,
    this.height = AppSizes.inputHeight,
    this.borderRadius = AppRadius.medium,
    this.semanticLabel = 'Loading content',
    super.key,
  });

  final double? width;
  final double height;
  final double borderRadius;
  final String semanticLabel;

  @override
  State<FeastaSkeleton> createState() => _FeastaSkeletonState();
}

class _FeastaSkeletonState extends State<FeastaSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: AppDurations.skeletonPulse,
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: widget.semanticLabel,
      liveRegion: true,
      child: ExcludeSemantics(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) => DecoratedBox(
            decoration: BoxDecoration(
              color: Color.lerp(
                AppColors.skeleton,
                AppColors.skeletonHighlight,
                _controller.value,
              ),
              borderRadius: BorderRadius.circular(widget.borderRadius),
            ),
            child: child,
          ),
          child: SizedBox(width: widget.width, height: widget.height),
        ),
      ),
    );
  }
}
