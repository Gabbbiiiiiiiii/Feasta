import 'dart:async';

import '../security/secure_debug_log.dart';

Future<T> runStartupStep<T>({
  required String stepName,
  required Future<T> operation,
  required Duration timeout,
  required T fallbackValue,
}) async {
  try {
    return await operation.timeout(timeout);
  } on TimeoutException catch (error, stackTrace) {
    secureDebugLog(
      'Startup timeout at $stepName',
      error: error,
      stackTrace: stackTrace,
    );
    return fallbackValue;
  } catch (error, stackTrace) {
    secureDebugLog(
      'Startup failure at $stepName',
      error: error,
      stackTrace: stackTrace,
    );
    return fallbackValue;
  }
}
