import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../core/utils/startup_guard.dart';
import '../firebase_options.dart';

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  final firebaseApp = await runStartupStep<FirebaseApp?>(
    stepName: 'Firebase initialization',
    operation: Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    ),
    timeout: const Duration(seconds: 15),
    fallbackValue: null,
  );

  if (firebaseApp == null) {
    throw StateError(
      'Firebase initialization failed. '
      'The application cannot continue safely.',
    );
  }

  const useFirebaseEmulators = bool.fromEnvironment(
    'USE_FIREBASE_EMULATORS',
    defaultValue: false,
  );

  if (!useFirebaseEmulators) {
    debugPrint(
      'Firebase emulators are disabled. '
      'Using the configured Firebase project.',
    );
    return;
  }

  final emulatorConnected = await runStartupStep<bool>(
    stepName: 'Firebase emulator connection',
    operation: _connectFirebaseEmulators(),
    timeout: const Duration(seconds: 15),
    fallbackValue: false,
  );

  if (!emulatorConnected) {
    throw StateError(
      'Firebase emulator connection failed. '
      'The application will not continue against production Firebase '
      'while emulator mode is enabled.',
    );
  }
}

Future<bool> _connectFirebaseEmulators() async {
  final host = _firebaseEmulatorHost;

  debugPrint(
    'Connecting to Firebase emulators at $host...',
  );

  await FirebaseAuth.instance.useAuthEmulator(
    host,
    9099,
  );

  FirebaseFirestore.instance.useFirestoreEmulator(
    host,
    8080,
  );

  FirebaseFunctions.instanceFor(
    region: 'asia-southeast1',
  ).useFunctionsEmulator(
    host,
    5001,
  );

  FirebaseStorage.instance.useStorageEmulator(
    host,
    9199,
  );

  debugPrint(
    'Connected to Firebase emulators at $host',
  );

  return true;
}

String get _firebaseEmulatorHost {
  const configuredHost = String.fromEnvironment(
    'FIREBASE_EMULATOR_HOST',
    defaultValue: '',
  );

  final normalizedHost = configuredHost.trim();

  if (normalizedHost.isNotEmpty) {
    return normalizedHost;
  }

  if (kIsWeb) {
    return '127.0.0.1';
  }

  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
      // Android emulator only.
      // For a physical Android phone, pass FIREBASE_EMULATOR_HOST
      // using your computer's LAN IP or use adb reverse.
      return '10.0.2.2';

    case TargetPlatform.iOS:
    case TargetPlatform.macOS:
    case TargetPlatform.windows:
    case TargetPlatform.linux:
    case TargetPlatform.fuchsia:
      return '127.0.0.1';
  }
}