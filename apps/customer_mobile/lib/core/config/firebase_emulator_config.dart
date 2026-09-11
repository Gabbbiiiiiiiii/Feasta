import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

abstract final class FirebaseEmulatorConfig {
  static bool _configured = false;

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

    await FirebaseAuth.instance.useAuthEmulator(_host, 9099);

    FirebaseFirestore.instance.useFirestoreEmulator(_host, 8080);

    FirebaseStorage.instance.useStorageEmulator(_host, 9199);

    FirebaseFunctions.instanceFor(
      region: 'asia-southeast1',
    ).useFunctionsEmulator(_host, 5001);

    _configured = true;
  }
}
