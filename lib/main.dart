import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app.dart';
import 'core/utils/startup_guard.dart';
import 'firebase_options.dart';
import 'web/admin_app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await runStartupStep<FirebaseApp?>(
      stepName: 'Firebase initialization',
      operation: Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      ),
      timeout: const Duration(seconds: 15),
      fallbackValue: null,
    );
  } catch (error, stackTrace) {
    debugPrint('Firebase startup failed: $error');
    debugPrint(stackTrace.toString());
  }

  if (kIsWeb) {
    runApp(const FeastaAdminApp());
  } else {
    runApp(const FeastaApp());
  }
}