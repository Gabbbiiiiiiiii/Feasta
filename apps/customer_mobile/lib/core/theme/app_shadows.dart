import 'package:flutter/material.dart';

/// Shared elevation recipes for FEASTA surfaces.
abstract final class AppShadows {
  static const List<BoxShadow> none = [];

  static const List<BoxShadow> card = [
    BoxShadow(color: Color(0x0F2B211D), blurRadius: 2, offset: Offset(0, 1)),
  ];

  static const List<BoxShadow> floating = [
    BoxShadow(color: Color(0x1A2B211D), blurRadius: 12, offset: Offset(0, 4)),
  ];

  static const List<BoxShadow> modal = [
    BoxShadow(color: Color(0x292B211D), blurRadius: 32, offset: Offset(0, 12)),
  ];
}
