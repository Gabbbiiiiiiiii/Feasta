/// Shared FEASTA dimensions for controls, icons, avatars, navigation,
/// and common visual elements.
abstract final class AppSizes {
  /// Minimum accessible touch target.
  static const double minimumTouchTarget = 48;

  // Controls
  static const double buttonCompactHeight = 48;
  static const double buttonHeight = 56;
  static const double inputHeight = 56;
  static const double searchHeight = 56;

  // Icons
  static const double iconSmall = 16;
  static const double iconMedium = 20;
  static const double iconDefault = 24;
  static const double iconLarge = 32;
  static const double iconEmptyState = 56;

  // Avatars
  static const double avatarSmall = 32;
  static const double avatarMedium = 40;
  static const double avatarDefault = 48;
  static const double avatarLarge = 64;

  // Floating controls
  static const double floatingControl = 44;
  static const double floatingControlLarge = 48;

  // Navigation
  static const double appBarHeight = 64;
  static const double bottomNavigationHeight = 72;

  // Shared desktop/web-compatible values retained for existing code.
  static const double sidebarCollapsed = 72;
  static const double sidebarExpanded = 280;
}
