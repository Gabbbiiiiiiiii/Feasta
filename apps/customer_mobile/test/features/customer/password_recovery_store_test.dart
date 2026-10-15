import 'dart:convert';

import 'package:feasta/features/customer/account/data/password_recovery_store.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/password_recovery_preferences.dart';

void main() {
  for (final stage in PasswordRecoveryStage.values) {
    test(
      '$stage persists only UID and stage across new store instances',
      () async {
        final disk = <String, String>{};
        final first = PreferencesPasswordRecoveryStore(
          preferences: MemoryRecoveryPreferences(disk),
        );
        await first.write(PasswordRecoveryState('customer-a', stage));
        expect(jsonDecode(disk.values.single), {
          'uid': 'customer-a',
          'stage': stage.name,
        });
        final restored = PreferencesPasswordRecoveryStore(
          preferences: MemoryRecoveryPreferences(disk),
        );
        expect((await restored.read('customer-a'))?.stage, stage);
        expect(await restored.read('customer-b'), isNull);
        await restored.clear('customer-b');
        expect(disk.length, 1);
        await restored.clear('customer-a');
        expect(disk, isEmpty);
      },
    );
  }

  test(
    'malformed or cross-owner records cannot be used for recovery',
    () async {
      for (final raw in [
        'bad json',
        '{"uid":"customer-b","stage":"updateConfirmed"}',
        '{"uid":"customer-a","stage":"unknown"}',
      ]) {
        final disk = {'feasta_password_recovery_v1_customer-a': raw};
        final store = PreferencesPasswordRecoveryStore(
          preferences: MemoryRecoveryPreferences(disk),
        );
        await expectLater(store.read('customer-a'), throwsA(anything));
        expect(disk.values.single, raw);
      }
    },
  );
}
