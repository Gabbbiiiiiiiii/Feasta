import 'package:flutter_test/flutter_test.dart';

import '../lib/core/utils/startup_guard.dart';

void main() {
  test('runStartupStep returns fallback on timeout', () async {
    final result = await runStartupStep<int>(
      stepName: 'slow step',
      operation: Future.delayed(const Duration(milliseconds: 50), () => 42),
      timeout: const Duration(milliseconds: 10),
      fallbackValue: -1,
    );

    expect(result, -1);
  });

  test('runStartupStep returns the completed value', () async {
    final result = await runStartupStep<int>(
      stepName: 'fast step',
      operation: Future.value(7),
      timeout: const Duration(seconds: 1),
      fallbackValue: -1,
    );

    expect(result, 7);
  });
}
