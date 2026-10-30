import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter/rendering.dart';

/// Only fixed stage names and durations: never identities, tokens or errors.
abstract final class StartupTimings {
  static const enabled =
      !kReleaseMode && bool.fromEnvironment('FEASTA_OPENING_DIAGNOSTICS');
  static final _clock = Stopwatch();
  static const _native = MethodChannel('feasta/startup_timing');

  static void start() {
    if (!enabled) return;
    _clock.start();
    mark('dart_main');
    if (const bool.fromEnvironment('FEASTA_DETAILED_OPENING_TRACE')) {
      // Diagnostic run only: profiling every render operation adds overhead.
      debugProfileBuildsEnabled = true;
      debugProfileLayoutsEnabled = true;
      debugProfilePaintsEnabled = true;
    }
  }

  static void mark(String phase) {
    if (!enabled) return;
    developer.Timeline.instantSync('FEASTA startup: $phase');
    debugPrint(
      'FEASTA_STARTUP phase=$phase dartElapsedUs=${_clock.elapsedMicroseconds}',
    );
  }

  static void markFrame(String phase, int rasterFinishUs) {
    if (!enabled) return;
    final elapsed =
        _clock.elapsedMicroseconds - (developer.Timeline.now - rasterFinishUs);
    debugPrint('FEASTA_STARTUP phase=$phase dartElapsedUs=$elapsed');
  }

  static Future<T> measure<T>(
    String phase,
    Future<T> Function() operation,
  ) async {
    if (!enabled) return operation();
    final watch = Stopwatch()..start();
    mark('${phase}_start');
    try {
      return await operation();
    } finally {
      debugPrint(
        'FEASTA_STARTUP phase=${phase}_end durationUs=${watch.elapsedMicroseconds} '
        'dartElapsedUs=${_clock.elapsedMicroseconds}',
      );
    }
  }

  static Future<void> attachNativeClock() async {
    if (!enabled || defaultTargetPlatform != TargetPlatform.android || kIsWeb) {
      return;
    }
    final sent = _clock.elapsedMicroseconds;
    try {
      final nativeMs = await _native.invokeMethod<int>('begin');
      debugPrint(
        'FEASTA_STARTUP phase=native_clock_link nativeSinceActivityMs=$nativeMs '
        'dartSendUs=$sent dartReceiveUs=${_clock.elapsedMicroseconds}',
      );
    } on MissingPluginException {
      // Desktop/widget tests and non-Android platforms have no native clock.
    } on PlatformException {
      mark('native_clock_unavailable');
    }
  }
}
