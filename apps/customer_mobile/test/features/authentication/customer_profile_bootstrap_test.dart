import 'package:cloud_functions/cloud_functions.dart';
import 'package:feasta/features/authentication/data/services/customer_profile_bootstrap.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'missing callable endpoint never counts as a missing user profile',
    () async {
      final calls = <String>[];
      final bootstrap = CustomerProfileBootstrap(
        call: (name, _) async {
          calls.add(name);
          throw FirebaseFunctionsException(
            code: 'not-found',
            message: 'Callable not deployed',
          );
        },
        checkCurrent: () {},
      );
      await expectLater(
        bootstrap.synchronize(),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(calls, ['syncUserAuthState']);
    },
  );

  test('established account synchronizes without provisioning', () async {
    final calls = <String>[];
    await CustomerProfileBootstrap(
      call: (name, _) async => calls.add(name),
      checkCurrent: () {},
    ).synchronize();
    expect(calls, ['syncUserAuthState']);
  });

  test('confirmed missing user provisions without automatic consent', () async {
    final calls = <String>[];
    await CustomerProfileBootstrap(
      call: (name, data) async {
        calls.add(name);
        expect(data, isNull);
        if (name == 'syncUserAuthState') {
          throw FirebaseFunctionsException(
            code: 'not-found',
            message: 'User profile was not found.',
          );
        }
      },
      checkCurrent: () {},
    ).synchronize();
    expect(calls, ['syncUserAuthState', 'ensureUserProfile']);
  });

  for (final code in [
    'permission-denied',
    'unauthenticated',
    'unavailable',
    'failed-precondition',
    'deadline-exceeded',
  ]) {
    test('$code never triggers provisioning', () async {
      final calls = <String>[];
      final bootstrap = CustomerProfileBootstrap(
        call: (name, _) async {
          calls.add(name);
          throw FirebaseFunctionsException(code: code, message: 'Failed');
        },
        checkCurrent: () {},
      );
      await expectLater(
        bootstrap.synchronize(),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(calls, ['syncUserAuthState']);
    });
  }

  test(
    'identity switch prevents provisioning after missing-profile result',
    () async {
      var current = true;
      final calls = <String>[];
      final bootstrap = CustomerProfileBootstrap(
        call: (name, _) async {
          calls.add(name);
          current = false;
          throw FirebaseFunctionsException(
            code: 'not-found',
            message: 'User profile was not found.',
          );
        },
        checkCurrent: () {
          if (!current) throw StateError('Stale');
        },
      );
      await expectLater(bootstrap.synchronize(), throwsStateError);
      expect(calls, ['syncUserAuthState']);
    },
  );

  test(
    'consent-required propagates for onboarding and supports retry',
    () async {
      var accepted = false;
      final bootstrap = CustomerProfileBootstrap(
        call: (name, _) async {
          if (name == 'syncUserAuthState') {
            throw FirebaseFunctionsException(
              code: 'not-found',
              message: 'User profile was not found.',
            );
          }
          if (!accepted) {
            throw FirebaseFunctionsException(
              code: 'failed-precondition',
              message: 'Consent required',
              details: {'reason': 'consent-required'},
            );
          }
        },
        checkCurrent: () {},
      );
      await expectLater(
        bootstrap.synchronize(),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      accepted = true;
      await bootstrap.synchronize();
    },
  );
}
