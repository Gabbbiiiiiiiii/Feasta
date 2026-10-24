import 'package:feasta/core/utils/startup_timings.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'timing preserves operation results/failures and never logs exception data',
    () async {
      final messages = <String>[];
      final previous = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) {
        if (message != null) messages.add(message);
      };
      addTearDown(() => debugPrint = previous);
      StartupTimings.start();
      expect(await StartupTimings.measure('fixed_stage', () async => 42), 42);
      final failure = StateError('private_account_or_token_detail');
      await expectLater(
        StartupTimings.measure('fixed_stage', () async => throw failure),
        throwsA(same(failure)),
      );
      expect(
        messages.join(),
        isNot(contains('private_account_or_token_detail')),
      );
      if (StartupTimings.enabled) {
        expect(
          messages
              .where((line) => line.contains('phase=fixed_stage_end'))
              .length,
          2,
        );
      } else {
        expect(messages, isEmpty);
      }
    },
  );
}
