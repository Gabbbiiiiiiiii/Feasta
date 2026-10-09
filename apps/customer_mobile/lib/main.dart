import 'package:flutter/material.dart';

import 'app/app.dart';
import 'app/bootstrap.dart';
import 'core/security/secure_debug_log.dart';

Future<void> main() async {
  try {
    await bootstrap();
  } catch (error, stackTrace) {
    secureDebugLog(
      'Application startup failed',
      error: error,
      stackTrace: stackTrace,
    );
    runApp(const _StartupFailureApp());
    return;
  }

  runApp(const FeastaApp());
}

class _StartupFailureApp extends StatelessWidget {
  const _StartupFailureApp();

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
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
    );
  }
}
