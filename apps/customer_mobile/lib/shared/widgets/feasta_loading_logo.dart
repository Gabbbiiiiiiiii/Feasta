import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_durations.dart';
import '../../core/theme/app_sizes.dart';

class FeastaLoadingLogo extends StatefulWidget {
  const FeastaLoadingLogo({super.key});

  @override
  State<FeastaLoadingLogo> createState() => _FeastaLoadingLogoState();
}

class _FeastaLoadingLogoState extends State<FeastaLoadingLogo>
    with SingleTickerProviderStateMixin {
  late final AnimationController controller = AnimationController(
    vsync: this,
    duration: AppDurations.skeletonPulse,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) {
      controller.stop();
    } else if (!controller.isAnimating) {
      controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading',
      liveRegion: true,
      child: ExcludeSemantics(
        child: AnimatedBuilder(
          animation: controller,
          builder: (context, child) {
            final value = Curves.easeInOutBack.transform(controller.value);

            return Transform.scale(
              scaleX: 1 + (value * 0.24),
              scaleY: 1 - (value * 0.16),
              child: child,
            );
          },
          child: Image.asset(
            'assets/images/mobile_logo.png',
            height: AppSizes.avatarLarge,
            width: AppSizes.avatarLarge,
            fit: BoxFit.contain,
            color: AppColors.primary,
            colorBlendMode: BlendMode.srcIn,
          ),
        ),
      ),
    );
  }
}
