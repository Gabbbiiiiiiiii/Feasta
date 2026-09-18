import 'package:flutter/material.dart';

/// FEASTA's raw brand palette and accessible semantic color roles.
abstract final class AppColors {
  // ---------------------------------------------------------------------------
  // FEASTA BRAND
  // ---------------------------------------------------------------------------

  /// Main FEASTA brand color.
  /// Hex: #B02F00
  static const Color primary = Color(0xFFB02F00);

  /// Text/icons displayed on the primary brand color.
  ///
  /// White provides substantially better contrast on the darker FEASTA
  /// primary than the previous dark foreground.
  static const Color primaryForeground = Color(0xFFFFFFFF);

  /// Very light FEASTA tint used for selected navigation indicators,
  /// chips, highlighted containers, and other subtle brand surfaces.
  static const Color primarySubtle = Color(0xFFFFF1EC);

  /// Hover state for the FEASTA primary color.
  static const Color primaryHover = Color(0xFFA32B00);

  /// Pressed state for the FEASTA primary color.
  static const Color primaryPressed = Color(0xFF922700);

  /// Strong/dark FEASTA brand color used for links, selected navigation
  /// elements, emphasized icons, and other high-emphasis brand elements.
  static const Color primaryStrong = Color(0xFF8F2600);

  // ---------------------------------------------------------------------------
  // BASE SURFACES
  // ---------------------------------------------------------------------------

  static const Color background = Color(0xFFF8F6F3);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF1ECE8);

  // ---------------------------------------------------------------------------
  // TEXT
  // ---------------------------------------------------------------------------

  static const Color mainText = Color(0xFF2B211D);

  /// Required FEASTA brand gray. Use only for large text or decoration.
  static const Color secondaryText = Color(0xFF8C817A);

  /// Accessible normal-size secondary text on light FEASTA surfaces.
  static const Color secondaryTextAccessible = Color(0xFF6B625D);

  // ---------------------------------------------------------------------------
  // BORDERS / INTERACTION
  // ---------------------------------------------------------------------------

  static const Color border = Color(0xFFE8E1DB);
  static const Color controlBorder = Color(0xFF8C817A);

  /// Focus indicator follows the FEASTA brand.
  static const Color focus = Color(0xFFB02F00);

  // ---------------------------------------------------------------------------
  // SEMANTIC COLORS
  // ---------------------------------------------------------------------------

  // These intentionally remain separate from the FEASTA brand color.
  // Success, warning, error, and information states must retain their
  // semantic meaning throughout the application.

  static const Color success = Color(0xFF166534);
  static const Color warning = Color(0xFF92400E);
  static const Color error = Color(0xFFB42318);
  static const Color info = Color(0xFF1D4ED8);

  // ---------------------------------------------------------------------------
  // DISABLED / OVERLAY / LOADING
  // ---------------------------------------------------------------------------

  static const Color disabled = Color(0xFFD7CEC8);
  static const Color disabledForeground = Color(0xFF6B625D);

  static const Color overlay = Color(0x99000000);

  static const Color skeleton = Color(0xFFF1ECE8);
  static const Color skeletonHighlight = Color(0xFFE6DED8);

  // ---------------------------------------------------------------------------
  // SEMANTIC SUBTLE COLORS
  // ---------------------------------------------------------------------------

  static const Color successSubtle = Color(0xFFECFDF3);
  static const Color warningSubtle = Color(0xFFFFF7E6);
  static const Color errorSubtle = Color(0xFFFFF1F0);
  static const Color infoSubtle = Color(0xFFEFF6FF);
}
