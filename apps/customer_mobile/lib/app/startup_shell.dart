import 'package:flutter/material.dart';

import '../core/security/secure_debug_log.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/startup_timings.dart';
import '../features/splash/opening_animation.dart';

/// Presentation signals only. The authentication gate still owns access.
class StartupPresentation extends ChangeNotifier {
  bool ready = false;
  VoidCallback? browse;

  void update({required bool ready, VoidCallback? browse}) {
    if (this.ready == ready && this.browse == browse) return;
    this.ready = ready;
    this.browse = browse;
    notifyListeners();
  }
}

/// Starts Firebase after the first visible frame; creates the app only after the existing
/// Firebase -> App Check -> emulator initialization has succeeded.
class StartupShell extends StatefulWidget {
  const StartupShell({
    required this.initialize,
    required this.appBuilder,
    this.presentationReady,
    super.key,
  });

  final Future<void> Function() initialize;
  final Widget Function(StartupPresentation presentation) appBuilder;
  @visibleForTesting
  final Future<void>? presentationReady;

  @override
  State<StartupShell> createState() => _StartupShellState();
}

class _StartupShellState extends State<StartupShell> {
  final _presentation = StartupPresentation();
  bool _initialized = false;
  bool _failed = false;
  bool _frameDeferred = false;

  @override
  void initState() {
    super.initState();
    // Delay only for local artwork, never for network/security initialization.
    WidgetsBinding.instance.deferFirstFrame();
    _frameDeferred = true;
    StartupTimings.mark('startup_shell_mounted');
  }

  void _releaseFrame({bool startBootstrap = true}) {
    if (!_frameDeferred) return;
    _frameDeferred = false;
    StartupTimings.mark('allow_first_frame');
    WidgetsBinding.instance.allowFirstFrame();
    if (startBootstrap) _initializeAfterFirstFrame();
  }

  Future<void> _initializeAfterFirstFrame() async {
    // Plugin initialization can occupy Android's platform thread. Let local
    // artwork and the first real frame finish before starting that work.
    // The secure app is still constructed only after bootstrap fully succeeds.
    if (widget.presentationReady == null) {
      await WidgetsBinding.instance.waitUntilFirstFrameRasterized;
    }
    if (!mounted) return;
    await _initialize();
  }

  Future<void> _initialize() async {
    try {
      StartupTimings.mark('secure_bootstrap_start');
      await widget.initialize().timeout(const Duration(seconds: 45));
      if (!mounted) return;
      StartupTimings.mark('secure_bootstrap_ready');
      setState(() => _initialized = true);
    } catch (error, stack) {
      secureDebugLog(
        'Application startup failed',
        error: error,
        stackTrace: stack,
      );
      if (!mounted) return;
      StartupTimings.mark('secure_bootstrap_failed');
      setState(() => _failed = true);
      _presentation.update(ready: true);
    }
  }

  @override
  void dispose() {
    _releaseFrame(startBootstrap: false);
    _presentation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    builder: (context, child) => AnimatedBuilder(
      animation: _presentation,
      builder: (context, _) => OpeningAnimation(
        destinationReady: _presentation.ready,
        onBrowse: _presentation.browse,
        onArtworkReady: _releaseFrame,
        presentationReady: widget.presentationReady,
        child: child!,
      ),
    ),
    home: _failed
        ? const Scaffold(
            body: SafeArea(
              child: Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Feasta could not start securely. Please restart the app or '
                    'install the latest version.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          )
        : _initialized
        ? widget.appBuilder(_presentation)
        : const ColoredBox(color: feastaOpeningBackground),
  );
}
