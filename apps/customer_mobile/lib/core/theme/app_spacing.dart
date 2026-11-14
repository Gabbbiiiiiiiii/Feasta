/// FEASTA's shared spacing system.
///
/// Feature screens should prefer these tokens instead of arbitrary spacing
/// values so the entire customer experience remains visually consistent.
abstract final class AppSpacing {
  static const double none = 0;

  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 40;
  static const double huge = 48;
  static const double massive = 64;

  /// Standard horizontal gutter for mobile screens.
  static const double screen = 24;

  /// Standard internal padding for cards and elevated surfaces.
  static const double card = 20;

  /// Standard spacing between major sections.
  static const double section = 32;

  /// Standard spacing between related groups.
  static const double group = 24;
}
