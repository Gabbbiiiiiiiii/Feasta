import 'dart:io';

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
    debugPrint(
      'Firebase initialization failed. '
      'The app will continue with limited functionality.',
    );
    return;
  }

  const useFirebaseEmulators = bool.fromEnvironment(
    'USE_FIREBASE_EMULATORS',
    defaultValue: false,
  );

  if (useFirebaseEmulators) {
    await runStartupStep<void>(
      stepName: 'Firebase emulator connection',
      operation: _connectFirebaseEmulators(),
      timeout: const Duration(seconds: 10),
      fallbackValue: null,
    );
  }
}

Future<void> _connectFirebaseEmulators() async {
  final host = _firebaseEmulatorHost;

  await FirebaseAuth.instance.useAuthEmulator(host, 9099);

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

  debugPrint('Connected to Firebase emulators at $host');
}

String get _firebaseEmulatorHost {
  if (kIsWeb) {
    return '127.0.0.1';
  }

  if (Platform.isAndroid) {
    return '10.0.2.2';
  }

  return '127.0.0.1';
}