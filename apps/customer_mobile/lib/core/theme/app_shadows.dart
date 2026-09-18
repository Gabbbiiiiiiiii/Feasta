import 'package:flutter/material.dart';

/// FEASTA's soft elevation system.
///
/// These shadows use neutral black with very low opacity so the existing
/// FEASTA color palette is not changed.
///
/// Use these consistently instead of defining custom shadows inside feature
/// screens.
abstract final class AppShadows {
  static const List<BoxShadow> card = [
    BoxShadow(color: Color(0x0D000000), blurRadius: 24, offset: Offset(0, 8)),
  ];

  static const List<BoxShadow> floating = [
    BoxShadow(color: Color(0x14000000), blurRadius: 24, offset: Offset(0, 8)),
  ];

  static const List<BoxShadow> navigation = [
    BoxShadow(color: Color(0x0D000000), blurRadius: 20, offset: Offset(0, -4)),
  ];

  static const List<BoxShadow> prominent = [
    BoxShadow(color: Color(0x14000000), blurRadius: 32, offset: Offset(0, 12)),
  ];
}
