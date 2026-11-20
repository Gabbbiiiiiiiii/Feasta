import 'package:flutter/material.dart';

/// Mirrors apps/web/src/app/globals.css; keep semantic roles synchronized.
abstract final class AppColors {
  // ---------------------------------------------------------------------------
  // FEASTA BRAND
  // ---------------------------------------------------------------------------

  /// Main FEASTA brand color.
  /// Hex: #093B26
  static const Color primary = Color(0xFF093B26);

  /// Text/icons displayed on the primary brand color.
  ///
  /// White provides substantially better contrast on the darker FEASTA
  /// primary than the previous dark foreground.
  static const Color primaryForeground = Color(0xFFFFFFFF);

  /// Very light FEASTA tint used for selected navigation indicators,
  /// chips, highlighted containers, and other subtle brand surfaces.
  static const Color primarySubtle = Color(0xFFE8F1EE);

  /// Hover state for the FEASTA primary color.
  static const Color primaryHover = Color(0xFF10492E);

  /// Pressed state for the FEASTA primary color.
  static const Color primaryPressed = Color(0xFF073520);

  /// Strong/dark FEASTA brand color used for links, selected navigation
  /// elements, emphasized icons, and other high-emphasis brand elements.
  static const Color primaryStrong = Color(0xFF093B26);

  // ---------------------------------------------------------------------------
  // BASE SURFACES
  // ---------------------------------------------------------------------------

  static const Color secondary = Color(0xFFF3F4F4);
  static const Color accent = Color(0xFF0B6953);
  static const Color primarySubtleStrong = Color(0xFFD4E7DF);
  static const Color placeholder = Color(0xFF6B7D78);
  static const Color surfaceStrong = Color(0xFF073520);
  static const Color borderStrong = Color(0xFFC8CECC);
  static const Color shadow = Color(0x29003520);
  static const Color warningBorder = Color(0xFFF59E0B);
  static const Color rating = Color(0xFFFFB020);

  static const Color background = Color(0xFFF7F8F8);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFEDEFEF);

  // ---------------------------------------------------------------------------
  // TEXT
  // ---------------------------------------------------------------------------

  static const Color mainText = Color(0xFF123B30);

  /// Web muted foreground for secondary labels.
  static const Color secondaryText = Color(0xFF667A74);

  /// Accessible normal-size secondary text on light FEASTA surfaces.
  static const Color secondaryTextAccessible = Color(0xFF49665E);

  // ---------------------------------------------------------------------------
  // BORDERS / INTERACTION
  // ---------------------------------------------------------------------------

  static const Color border = Color(0xFFD9DEDC);
  static const Color controlBorder = Color(0xFFD9DEDC);

  /// Focus indicator follows the FEASTA brand.
  static const Color focus = Color(0xFF087159);

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

  static const Color disabled = Color(0xFFF3F4F4);
  static const Color disabledForeground = Color(0xFF49665E);

  static const Color overlay = Color(0x4D1E1E1E);

  static const Color skeleton = Color(0xFFE5E7E7);
  static const Color skeletonHighlight = Color(0xFFF8F9F9);

  // ---------------------------------------------------------------------------
  // SEMANTIC SUBTLE COLORS
  // ---------------------------------------------------------------------------

  static const Color successSubtle = Color(0xFFECFDF3);
  static const Color warningSubtle = Color(0xFFFFF7E6);
  static const Color errorSubtle = Color(0xFFFFF1F0);
  static const Color infoSubtle = Color(0xFFEFF6FF);
}
