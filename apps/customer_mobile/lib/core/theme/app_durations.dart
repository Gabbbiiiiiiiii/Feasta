import 'package:flutter/animation.dart';

/// FEASTA motion tokens.
///
/// Animations remain subtle and fast. Screens should use [Duration.zero]
/// whenever reduced-motion accessibility settings are enabled.
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
