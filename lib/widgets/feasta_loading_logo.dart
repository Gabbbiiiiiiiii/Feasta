import 'package:flutter/material.dart';

class FeastaLoadingLogo extends StatefulWidget {
  const FeastaLoadingLogo({super.key});

  @override
  State<FeastaLoadingLogo> createState() => _FeastaLoadingLogoState();
}

class _FeastaLoadingLogoState extends State<FeastaLoadingLogo>
    with SingleTickerProviderStateMixin {
  late final AnimationController controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 760),
  )..repeat(reverse: true);

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final animation = CurvedAnimation(
      parent: controller,
      curve: Curves.easeInOutBack,
    );

    return AnimatedBuilder(
    animation: controller,
    builder: (context, child) {
        final value = Curves.easeInOutBack.transform(controller.value);

        return Transform(
        alignment: Alignment.center,
        transform: Matrix4.identity()
            ..scale(
            1.0 + (value * 0.24), // stretch width
            1.0 - (value * 0.16), // squash height
            ),
        child: child,
        );
    },
    child: Image.asset(
        'assets/images/mobile_logo.png',
        height: 64,
        width: 64,
        fit: BoxFit.contain,
        color: const Color(0xFFFF6333),
        colorBlendMode: BlendMode.srcIn,
    ),
    );
  }
}