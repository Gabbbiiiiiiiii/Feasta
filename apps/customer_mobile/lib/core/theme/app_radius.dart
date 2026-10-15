/// FEASTA's shared corner-radius system.
///
/// The customer mobile experience intentionally uses generous rounded
/// geometry. Avoid arbitrary BorderRadius values inside feature screens.
abstract final class AppRadius {
  /// Small embedded surfaces, tooltips, and compact controls.
  static const double xSmall = 8;

  /// Small controls.
  static const double small = 12;

  /// Inputs and compact interactive elements.
  static const double medium = 16;

  /// Main buttons and larger controls.
  static const double large = 20;

  /// Standard marketplace and content card.
  static const double card = 24;

  /// Featured or layered surface.
  static const double surface = 28;

  /// Dialogs and bottom-sheet surfaces.
  static const double dialog = 28;

  /// Provider/package/event imagery.
  static const double image = 24;

  /// Interactive controls inside cards.
  static const double control = 16;

  /// Fully rounded filters, chips, and badges.
  static const double pill = 999;

  static const double circular = 999;
}
