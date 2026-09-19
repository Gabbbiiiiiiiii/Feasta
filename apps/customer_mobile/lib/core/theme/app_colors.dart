import 'package:flutter/material.dart';

/// FEASTA's raw brand palette and accessible semantic color roles.
abstract final class AppColors {
  static const Color primary = Color(0xFFFF6333);
  static const Color primaryForeground = Color(0xFF2B211D);
  static const Color primarySubtle = Color(0xFFFFF3EE);
  static const Color primaryHover = Color(0xFFF85D2F);
  static const Color primaryPressed = Color(0xFFF05729);
  static const Color primaryStrong = Color(0xFFB83A12);

  static const Color background = Color(0xFFF8F6F3);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF1ECE8);
  static const Color mainText = Color(0xFF2B211D);

  /// Required FEASTA brand gray. Use only for large text or decoration.
  static const Color secondaryText = Color(0xFF8C817A);

  /// Accessible normal-size secondary text on light FEASTA surfaces.
  static const Color secondaryTextAccessible = Color(0xFF6B625D);

  static const Color border = Color(0xFFE8E1DB);
  static const Color controlBorder = Color(0xFF8C817A);
  static const Color focus = Color(0xFFB83A12);
  static const Color success = Color(0xFF166534);
  static const Color warning = Color(0xFF92400E);
  static const Color error = Color(0xFFB42318);
  static const Color info = Color(0xFF1D4ED8);
  static const Color disabled = Color(0xFFD7CEC8);
  static const Color disabledForeground = Color(0xFF6B625D);
  static const Color overlay = Color(0x99000000);
  static const Color skeleton = Color(0xFFF1ECE8);
  static const Color skeletonHighlight = Color(0xFFE6DED8);

  static const Color successSubtle = Color(0xFFECFDF3);
  static const Color warningSubtle = Color(0xFFFFF7E6);
  static const Color errorSubtle = Color(0xFFFFF1F0);
  static const Color infoSubtle = Color(0xFFEFF6FF);
}
