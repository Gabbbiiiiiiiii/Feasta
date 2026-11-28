// SDK types are mocked; no Firebase app or network request is initialized.
// ignore_for_file: subtype_of_sealed_class
import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:feasta/features/authentication/data/repositories/auth_repository.dart';
import 'package:feasta/features/authentication/application/password_reset_controller.dart';
import 'package:feasta/features/authentication/domain/account_recovery.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

class ResetAuth extends Fake implements FirebaseAuth {
  String? code;
  int calls = 0;
  String? receivedEmail;
  Completer<void>? pending;
  @override
  Future<void> sendPasswordResetEmail({
    required String email,
    ActionCodeSettings? actionCodeSettings,
  }) async {
    calls++;
    receivedEmail = email;
    await pending?.future;
    if (code != null) {
      throw FirebaseAuthException(
        code: code!,
        message: 'private@example.test token=do-not-log password=private',
        email: 'private@example.test',
      );
    }
  }
}

class UnusedStore extends Fake implements FirebaseFirestore {}

class UnusedFunctions extends Fake implements FirebaseFunctions {}

AuthRepository repository(ResetAuth auth) => AuthRepository(
  auth: auth,
  firestore: UnusedStore(),
  functions: UnusedFunctions(),
);
void main() {
  test(
    'success normalizes email; unknown accounts keep the same generic result',
    () async {
      final auth = ResetAuth();
      final repo = repository(auth);
      await repo.requestPasswordReset(' CUSTOMER@FEASTA.TEST ');
      expect(auth.receivedEmail, 'customer@feasta.test');
      auth.code = 'user-not-found';
      final controller = PasswordResetController(gateway: repo);
      await controller.submit('unknown@feasta.test');
      expect(controller.state.success, isTrue);
      expect(controller.state.error, isNull);
      controller.dispose();
    },
  );
  for (final code in [
    'invalid-api-key',
    'app-not-authorized',
    'operation-not-allowed',
    'configuration-not-found',
    'invalid-app-credential',
    'missing-app-credential',
    'app-check-token-invalid',
    'captcha-check-failed',
    'invalid-recaptcha-token',
    'network-request-failed',
    'too-many-requests',
    'quota-exceeded',
    'internal-error',
    'unknown',
  ]) {
    test('$code remains a failure and logs only the sanitized code', () async {
      final auth = ResetAuth()..code = code;
      final logs = <String>[];
      final previous = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) {
        if (message != null) logs.add(message);
      };
      addTearDown(() => debugPrint = previous);
      final controller = PasswordResetController(gateway: repository(auth));
      await controller.submit('private@example.test');
      expect(controller.state.success, isFalse);
      expect(controller.state.error, isNotNull);
      expect(logs.join(), contains('Recovery request FirebaseAuth code=$code'));
      for (final sensitive in [
        'private@example.test',
        'do-not-log',
        'password=',
        'token=',
      ]) {
        expect(logs.join(), isNot(contains(sensitive)));
      }
      if (['too-many-requests', 'quota-exceeded'].contains(code)) {
        expect(controller.state.error, contains('Too many reset requests'));
      }
      if (code == 'network-request-failed') {
        expect(controller.state.error, contains('internet connection'));
      }
      controller.dispose();
    });
  }
  test('invalid-email never reports success', () async {
    final controller = PasswordResetController(
      gateway: repository(ResetAuth()..code = 'invalid-email'),
    );
    await controller.submit('syntactically.valid@feasta.test');
    expect(controller.state.success, isFalse);
    expect(controller.state.emailError, 'Enter a valid email address.');
    controller.dispose();
  });
  test('disabled account failure does not disclose account status', () async {
    final controller = PasswordResetController(
      gateway: repository(ResetAuth()..code = 'user-disabled'),
    );
    await controller.submit('customer@feasta.test');
    expect(controller.state.success, isFalse);
    expect(controller.state.error, isNot(contains('disabled')));
    controller.dispose();
  });
  test(
    'malformed exception code cannot leak personal data to debug output',
    () async {
      final previous = debugPrint;
      final logs = <String>[];
      debugPrint = (String? message, {int? wrapWidth}) {
        if (message != null) logs.add(message);
      };
      addTearDown(() => debugPrint = previous);
      await expectLater(
        repository(
          ResetAuth()..code = 'private@example.test token=private',
        ).requestPasswordReset('private@example.test'),
        throwsA(isA<AccountRecoveryException>()),
      );
      expect(logs, ['Recovery request FirebaseAuth code=unrecognized-code']);
    },
  );
  test(
    'duplicates and late completion after leaving recovery are safe',
    () async {
      final auth = ResetAuth()..pending = Completer<void>();
      final controller = PasswordResetController(gateway: repository(auth));
      final request = controller.submit('customer@feasta.test');
      expect(controller.state.isSubmitting, isTrue);
      await controller.submit('customer@feasta.test');
      expect(auth.calls, 1);
      controller.dispose();
      auth.pending!.complete();
      await request;
    },
  );
}
