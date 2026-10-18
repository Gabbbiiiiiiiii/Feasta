import 'package:flutter/foundation.dart';

/// Fixed phase labels only: never pass account or exception data.
abstract final class AuthTiming {
  static Stopwatch? start() => kDebugMode ? (Stopwatch()..start()) : null;

  static void finish(String phase, Stopwatch? watch) {
    if (watch != null) {
      debugPrint(
        'FEASTA_AUTH_TIMING phase=$phase ms=${watch.elapsedMilliseconds}',
      );
    }
  }

  static Future<T> measure<T>(
    String phase,
    Future<T> Function() operation,
  ) async {
    final watch = kDebugMode ? (Stopwatch()..start()) : null;
    try {
      return await operation();
    } finally {
      if (watch != null) {
        debugPrint(
          'FEASTA_AUTH_TIMING phase=$phase ms=${watch.elapsedMilliseconds}',
        );
      }
    }
  }
}
