import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Cross-platform FEASTA type hierarchy using the platform sans-serif.
abstract final class AppTypography {
  static const TextStyle display = TextStyle(
    fontSize: 40,
    height: 1.2,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.6,
  );

  static const TextStyle headline = TextStyle(
    fontSize: 32,
    height: 1.25,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.4,
  );

  static const TextStyle title = TextStyle(
    fontSize: 20,
    height: 1.4,
    fontWeight: FontWeight.w700,
  );

  static const TextStyle bodyLarge = TextStyle(
    fontSize: 18,
    height: 1.55,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle body = TextStyle(
    fontSize: 16,
    height: 1.5,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle bodySmall = TextStyle(
    fontSize: 14,
    height: 1.45,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle label = TextStyle(
    fontSize: 14,
    height: 1.4,
    fontWeight: FontWeight.w700,
  );

  static const TextStyle caption = TextStyle(
    fontSize: 12,
    height: 1.35,
    fontWeight: FontWeight.w500,
  );

  static const TextStyle button = TextStyle(
    fontSize: 16,
    height: 1.25,
    fontWeight: FontWeight.w700,
  );

  static const TextStyle helper = TextStyle(
    color: AppColors.secondaryTextAccessible,
    fontSize: 12,
    height: 1.4,
    fontWeight: FontWeight.w500,
  );

  static const TextStyle error = TextStyle(
    color: AppColors.error,
    fontSize: 12,
    height: 1.4,
    fontWeight: FontWeight.w600,
  );

  static const TextTheme textTheme = TextTheme(
    displayLarge: display,
    displayMedium: headline,
    headlineLarge: headline,
    headlineMedium: TextStyle(
      fontSize: 28,
      height: 1.3,
      fontWeight: FontWeight.w800,
    ),
    headlineSmall: TextStyle(
      fontSize: 24,
      height: 1.35,
      fontWeight: FontWeight.w700,
    ),
    titleLarge: title,
    titleMedium: TextStyle(
      fontSize: 18,
      height: 1.4,
      fontWeight: FontWeight.w700,
    ),
    titleSmall: TextStyle(
      fontSize: 16,
      height: 1.4,
      fontWeight: FontWeight.w700,
    ),
    bodyLarge: bodyLarge,
    bodyMedium: body,
    bodySmall: bodySmall,
    labelLarge: button,
    labelMedium: label,
    labelSmall: caption,
  );
}
