import 'package:flutter/animation.dart';

/// Motion tokens. Callers must use [Duration.zero] when reduced motion applies.
abstract final class AppDurations {
  static const Duration reduced = Duration.zero;
  static const Duration instant = Duration(milliseconds: 100);
  static const Duration fast = Duration(milliseconds: 160);
  static const Duration normal = Duration(milliseconds: 240);
  static const Duration slow = Duration(milliseconds: 360);
  static const Duration skeletonPulse = Duration(milliseconds: 1200);

  static const Curve standardCurve = Curves.easeInOutCubic;
  static const Curve emphasizedCurve = Curves.easeOutCubic;
}
