import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

abstract final class FirebaseEmulatorConfig {
  static bool _configured = false;
  static const demoProjectId = String.fromEnvironment(
    'FIREBASE_EMULATOR_PROJECT_ID',
  );
  static const useEmulators = bool.fromEnvironment('USE_FIREBASE_EMULATORS');
  static const authPort = int.fromEnvironment(
    'FIREBASE_AUTH_EMULATOR_PORT',
    defaultValue: 9099,
  );
  static const firestorePort = int.fromEnvironment(
    'FIRESTORE_EMULATOR_PORT',
    defaultValue: 8080,
  );
  static const functionsPort = int.fromEnvironment(
    'FIREBASE_FUNCTIONS_EMULATOR_PORT',
    defaultValue: 5001,
  );
  static const storagePort = int.fromEnvironment(
    'FIREBASE_STORAGE_EMULATOR_PORT',
    defaultValue: 9199,
  );
  static bool get v2DiscoveryEnabled =>
      kDebugMode &&
      useEmulators &&
      RegExp(r'^demo-[a-z0-9-]+$').hasMatch(demoProjectId);

  /// Explicit debug-only override; never reuse real credentials for a demo app.
  static FirebaseOptions? debugDemoOptions({
    required String projectId,
    required bool useEmulators,
    required bool isDebugMode,
  }) {
    if (projectId.isEmpty) return null;
    if (!useEmulators ||
        !isDebugMode ||
        !RegExp(r'^demo-[a-z0-9-]+$').hasMatch(projectId)) {
      throw StateError('A demo Firebase project requires debug emulator mode.');
    }
    return FirebaseOptions(
      apiKey: 'demo-only',
      appId:
          '1:1234567890:${defaultTargetPlatform == TargetPlatform.android
              ? 'android'
              : defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS
              ? 'ios'
              : 'web'}:0123456789abcdef',
      messagingSenderId: '1234567890',
      projectId: projectId,
      authDomain: '$projectId.firebaseapp.com',
      storageBucket: '$projectId.firebasestorage.app',
    );
  }

  static void validatePorts() {
    if ([
      authPort,
      firestorePort,
      functionsPort,
      storagePort,
    ].any((port) => port < 1 || port > 65535)) {
      throw StateError('Invalid Firebase emulator port.');
    }
  }

  static String get _host {
    if (kIsWeb) {
      return '127.0.0.1';
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return '10.0.2.2';

      default:
        return '127.0.0.1';
    }
  }

  static Future<void> configure() async {
    if (_configured || kReleaseMode) {
      return;
    }

    await FirebaseAuth.instance.useAuthEmulator(_host, authPort);

    FirebaseFirestore.instance.useFirestoreEmulator(_host, firestorePort);

    FirebaseStorage.instance.useStorageEmulator(_host, storagePort);

    FirebaseFunctions.instanceFor(
      region: 'asia-southeast1',
    ).useFunctionsEmulator(_host, functionsPort);

    _configured = true;
  }
}
