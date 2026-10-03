import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_durations.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_sizes.dart';

class FeastaSkeletonPulse extends StatefulWidget {
  final Widget child;

  const FeastaSkeletonPulse({super.key, required this.child});

  @override
  State<FeastaSkeletonPulse> createState() => _FeastaSkeletonPulseState();
}

class _FeastaSkeletonPulseState extends State<FeastaSkeletonPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: AppDurations.skeletonPulse,
    );

    _opacity = Tween<double>(
      begin: 0.55,
      end: 1,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) {
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
    return FadeTransition(opacity: _opacity, child: widget.child);
  }
}

class FeastaSkeletonBox extends StatelessWidget {
  final double? width;
  final double height;
  final double radius;
  final Color color;

  const FeastaSkeletonBox({
    super.key,
    this.width,
    required this.height,
    this.radius = AppRadius.medium,
    this.color = AppColors.skeleton,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class FeastaSkeletonCircle extends StatelessWidget {
  final double size;

  const FeastaSkeletonCircle({super.key, this.size = AppSizes.avatarDefault});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: size,
      width: size,
      decoration: const BoxDecoration(
        color: AppColors.skeleton,
        shape: BoxShape.circle,
      ),
    );
  }
}

class FeastaSkeletonList extends StatelessWidget {
  final int itemCount;
  final EdgeInsetsGeometry padding;
  final bool showLeading;
  final bool showTrailing;
  final bool showImage;
  final double imageHeight;
  final double cardRadius;

  const FeastaSkeletonList({
    super.key,
    this.itemCount = 5,
    this.padding = const EdgeInsets.all(16),
    this.showLeading = true,
    this.showTrailing = true,
    this.showImage = false,
    this.imageHeight = 150,
    this.cardRadius = 22,
  });

  @override
  Widget build(BuildContext context) {
    return FeastaSkeletonPulse(
      child: ListView.separated(
        padding: padding,
        itemCount: itemCount,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          return _SkeletonCard(
            showLeading: showLeading,
            showTrailing: showTrailing,
            showImage: showImage,
            imageHeight: imageHeight,
            cardRadius: cardRadius,
          );
        },
      ),
    );
  }
}

class FeastaSkeletonHorizontalCards extends StatelessWidget {
  final int itemCount;
  final double height;
  final double width;
  final EdgeInsetsGeometry padding;

  const FeastaSkeletonHorizontalCards({
    super.key,
    this.itemCount = 4,
    this.height = 180,
    this.width = 190,
    this.padding = EdgeInsets.zero,
  });

  @override
  Widget build(BuildContext context) {
    return FeastaSkeletonPulse(
      child: SizedBox(
        height: height,
        child: ListView.separated(
          padding: padding,
          scrollDirection: Axis.horizontal,
          itemCount: itemCount,
          separatorBuilder: (_, _) => const SizedBox(width: 12),
          itemBuilder: (context, index) {
            return SizedBox(
              width: width,
              child: const _SkeletonCard(
                showLeading: false,
                showTrailing: false,
                showImage: true,
                imageHeight: 86,
                cardRadius: 22,
              ),
            );
          },
        ),
      ),
    );
  }
}

class FeastaSkeletonGrid extends StatelessWidget {
  final int itemCount;
  final EdgeInsetsGeometry padding;
  final int crossAxisCount;

  const FeastaSkeletonGrid({
    super.key,
    this.itemCount = 6,
    this.padding = const EdgeInsets.all(16),
    this.crossAxisCount = 2,
  });

  @override
  Widget build(BuildContext context) {
    return FeastaSkeletonPulse(
      child: GridView.builder(
        padding: padding,
        itemCount: itemCount,
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: crossAxisCount,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 0.82,
        ),
        itemBuilder: (context, index) {
          return const _SkeletonCard(
            showLeading: false,
            showTrailing: false,
            showImage: true,
            imageHeight: 112,
            cardRadius: 22,
          );
        },
      ),
    );
  }
}

class FeastaSkeletonDetailPage extends StatelessWidget {
  final EdgeInsetsGeometry padding;
  final bool showHero;

  const FeastaSkeletonDetailPage({
    super.key,
    this.padding = const EdgeInsets.all(18),
    this.showHero = true,
  });

  @override
  Widget build(BuildContext context) {
    return FeastaSkeletonPulse(
      child: ListView(
        padding: padding,
        children: [
          if (showHero) ...[
            const FeastaSkeletonBox(height: 210, radius: 24),
            const SizedBox(height: 18),
          ],
          const FeastaSkeletonBox(width: 210, height: 24, radius: 10),
          const SizedBox(height: 10),
          const FeastaSkeletonBox(width: 150, height: 14, radius: 8),
          const SizedBox(height: 20),
          const FeastaSkeletonBox(height: 92, radius: 20),
          const SizedBox(height: 14),
          const FeastaSkeletonBox(height: 92, radius: 20),
          const SizedBox(height: 14),
          const FeastaSkeletonBox(height: 132, radius: 20),
        ],
      ),
    );
  }
}

class FeastaSkeletonDashboard extends StatelessWidget {
  const FeastaSkeletonDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return FeastaSkeletonPulse(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const FeastaSkeletonBox(height: 94, radius: 22),
          const SizedBox(height: 16),
          Row(
            children: const [
              Expanded(child: FeastaSkeletonBox(height: 86, radius: 20)),
              SizedBox(width: 12),
              Expanded(child: FeastaSkeletonBox(height: 86, radius: 20)),
            ],
          ),
          const SizedBox(height: 18),
          const FeastaSkeletonBox(width: 160, height: 20, radius: 9),
          const SizedBox(height: 12),
          const _SkeletonCard(),
          const SizedBox(height: 12),
          const _SkeletonCard(),
          const SizedBox(height: 12),
          const _SkeletonCard(),
        ],
      ),
    );
  }
}

class FeastaSkeletonChat extends StatelessWidget {
  const FeastaSkeletonChat({super.key});

  @override
  Widget build(BuildContext context) {
    return FeastaSkeletonPulse(
      child: ListView(
        reverse: true,
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
        children: const [
          _ChatBubbleSkeleton(widthFactor: 0.64, alignRight: true),
          SizedBox(height: 12),
          _ChatBubbleSkeleton(widthFactor: 0.78),
          SizedBox(height: 12),
          _ChatBubbleSkeleton(widthFactor: 0.58, alignRight: true),
          SizedBox(height: 12),
          _ChatBubbleSkeleton(widthFactor: 0.72),
          SizedBox(height: 12),
          _ChatBubbleSkeleton(widthFactor: 0.48, alignRight: true),
        ],
      ),
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  final bool showLeading;
  final bool showTrailing;
  final bool showImage;
  final double imageHeight;
  final double cardRadius;

  const _SkeletonCard({
    this.showLeading = true,
    this.showTrailing = true,
    this.showImage = false,
    this.imageHeight = 150,
    this.cardRadius = 22,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(cardRadius),
        border: Border.all(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          if (showImage)
            FeastaSkeletonBox(
              height: imageHeight,
              radius: 0,
              color: AppColors.skeletonHighlight,
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (showLeading) ...[
                  const FeastaSkeletonCircle(size: 48),
                  const SizedBox(width: 14),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      FeastaSkeletonBox(width: 170, height: 17, radius: 8),
                      SizedBox(height: 10),
                      FeastaSkeletonBox(height: 12, radius: 8),
                      SizedBox(height: 8),
                      FeastaSkeletonBox(width: 120, height: 12, radius: 8),
                    ],
                  ),
                ),
                if (showTrailing) ...[
                  const SizedBox(width: 12),
                  const FeastaSkeletonBox(width: 58, height: 28, radius: 999),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatBubbleSkeleton extends StatelessWidget {
  final double widthFactor;
  final bool alignRight;

  const _ChatBubbleSkeleton({
    required this.widthFactor,
    this.alignRight = false,
  });

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      widthFactor: widthFactor,
      alignment: alignRight ? Alignment.centerRight : Alignment.centerLeft,
      child: const FeastaSkeletonBox(height: 58, radius: 18),
    );
  }
}
