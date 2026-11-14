import 'package:feasta/features/authentication/data/services/registration_rollback.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('returns the identity when initial profile creation succeeds', () async {
    var rolledBack = false;
    final identity = await createIdentityAndProfile<int>(
      createIdentity: () async => 42,
      createProfile: (value) async => expect(value, 42),
      rollbackIdentity: (_) async => rolledBack = true,
    );

    expect(identity, 42);
    expect(rolledBack, isFalse);
  });

  test('rolls back Auth identity and preserves the profile error', () async {
    var rolledBackIdentity = 0;

    await expectLater(
      createIdentityAndProfile<int>(
        createIdentity: () async => 7,
        createProfile: (_) async => throw StateError('profile failed'),
        rollbackIdentity: (identity) async => rolledBackIdentity = identity,
      ),
      throwsA(isA<StateError>()),
    );
    expect(rolledBackIdentity, 7);
  });

  test('preserves profile failure even when rollback also fails', () async {
    await expectLater(
      createIdentityAndProfile<int>(
        createIdentity: () async => 9,
        createProfile: (_) async => throw ArgumentError('profile failed'),
        rollbackIdentity: (_) async => throw StateError('rollback failed'),
      ),
      throwsA(isA<ArgumentError>()),
    );
  });
}
