/// Shared responsive breakpoints in logical pixels.
abstract final class AppBreakpoints {
  static const double mobile = 0;
  static const double tablet = 600;
  static const double laptop = 1024;
  static const double desktop = 1280;
  static const double largeDesktop = 1536;

  static AppWindowClass windowClassFor(double width) {
    if (width >= largeDesktop) return AppWindowClass.largeDesktop;
    if (width >= desktop) return AppWindowClass.desktop;
    if (width >= laptop) return AppWindowClass.laptop;
    if (width >= tablet) return AppWindowClass.tablet;
    return AppWindowClass.mobile;
  }
}

enum AppWindowClass { mobile, tablet, laptop, desktop, largeDesktop }
