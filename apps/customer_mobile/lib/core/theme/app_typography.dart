import 'package:flutter/material.dart';

import 'app_colors.dart';

/// FEASTA's application-wide typography hierarchy.
///
/// The current FEASTA palette remains unchanged. Typography emphasizes clear
/// hierarchy, generous readability, and restrained premium styling.
abstract final class AppTypography {
  static const TextStyle display = TextStyle(
    color: AppColors.mainText,
    fontSize: 40,
    height: 1.2,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.6,
  );

  static const TextStyle headline = TextStyle(
    color: AppColors.mainText,
    fontSize: 32,
    height: 1.25,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.4,
  );

  static const TextStyle pageTitle = TextStyle(
    color: AppColors.mainText,
    fontSize: 28,
    height: 1.25,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.3,
  );

  static const TextStyle sectionTitle = TextStyle(
    color: AppColors.mainText,
    fontSize: 22,
    height: 1.3,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.1,
  );

  static const TextStyle title = TextStyle(
    color: AppColors.mainText,
    fontSize: 20,
    height: 1.4,
    fontWeight: FontWeight.w700,
  );

  static const TextStyle cardTitle = TextStyle(
    color: AppColors.mainText,
    fontSize: 16,
    height: 1.4,
    fontWeight: FontWeight.w600,
  );

  static const TextStyle bodyLarge = TextStyle(
    color: AppColors.mainText,
    fontSize: 18,
    height: 1.55,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle body = TextStyle(
    color: AppColors.mainText,
    fontSize: 16,
    height: 1.5,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle bodySmall = TextStyle(
    color: AppColors.secondaryTextAccessible,
    fontSize: 14,
    height: 1.45,
    fontWeight: FontWeight.w400,
  );

  static const TextStyle label = TextStyle(
    color: AppColors.mainText,
    fontSize: 14,
    height: 1.4,
    fontWeight: FontWeight.w600,
  );

  static const TextStyle caption = TextStyle(
    color: AppColors.secondaryTextAccessible,
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
    displaySmall: pageTitle,

    headlineLarge: headline,
    headlineMedium: pageTitle,
    headlineSmall: sectionTitle,

    titleLarge: title,
    titleMedium: TextStyle(
      color: AppColors.mainText,
      fontSize: 18,
      height: 1.4,
      fontWeight: FontWeight.w700,
    ),
    titleSmall: cardTitle,

    bodyLarge: bodyLarge,
    bodyMedium: body,
    bodySmall: bodySmall,

    labelLarge: button,
    labelMedium: label,
    labelSmall: caption,
  );
}
