import 'package:flutter/foundation.dart';

void secureDebugLog(
  String message, {
  Object? error,
  StackTrace? stackTrace,
}) {
  if (!kDebugMode) return;
  final detail = error == null ? message : '$message: $error';
  debugPrint(_redact(detail));
  if (stackTrace != null) debugPrintStack(stackTrace: stackTrace);
}

String _redact(String value) {
  return value
      .replaceAll(
        RegExp(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', caseSensitive: false),
        '[masked-email]',
      )
      .replaceAll(RegExp(r'\+?\d[\d\s().-]{7,}\d'), '[masked-phone]')
      .replaceAll(
        RegExp(r'(?:bearer|token|password|secret)\s*[:=]?\s*\S+', caseSensitive: false),
        '[redacted]',
      );
}
