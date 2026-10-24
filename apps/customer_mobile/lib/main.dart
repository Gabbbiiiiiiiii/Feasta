import 'package:flutter/material.dart';

import 'app/app.dart';
import 'app/bootstrap.dart';
import 'app/startup_shell.dart';
import 'core/utils/startup_timings.dart';

void main() {
  StartupTimings.start();
  WidgetsFlutterBinding.ensureInitialized();
  StartupTimings.mark('binding_ready');
  // Diagnostic clock correlation never gates the first frame.
  StartupTimings.attachNativeClock();
  StartupTimings.mark('run_app');
  runApp(
    StartupShell(
      initialize: bootstrap,
      appBuilder: (presentation) =>
          FeastaApp(startupPresentation: presentation),
    ),
  );
}
