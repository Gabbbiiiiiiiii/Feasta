import 'dart:async';

import 'package:flutter/foundation.dart';

Future<T> runStartupStep<T>({
  required String stepName,
  required Future<T> operation,
  required Duration timeout,
  required T fallbackValue,
}) async {
  try {
    return await operation.timeout(timeout);
  } on TimeoutException catch (error, stackTrace) {
    debugPrint('Startup timeout at $stepName: $error');
    debugPrint(stackTrace.toString());
    return fallbackValue;
  } catch (error, stackTrace) {
    debugPrint('Startup failure at $stepName: $error');
    debugPrint(stackTrace.toString());
    return fallbackValue;
  }
}
