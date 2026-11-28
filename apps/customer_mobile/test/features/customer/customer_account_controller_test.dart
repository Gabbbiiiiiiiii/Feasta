import 'dart:async';

import 'package:feasta/features/customer/account/application/customer_account_controller.dart';
import 'package:feasta/features/customer/account/domain/customer_account_management.dart';
import 'package:flutter_test/flutter_test.dart';

const _testCredential = 'fixture credential';

void main() {
  group('CustomerAccountController', () {
    test('passes only the explicit editable profile model', () async {
      final gateway = _FakeGateway();
      final controller = CustomerAccountController(gateway);
      const update = CustomerProfileUpdate(
        firstName: 'Gabby',
        lastName: 'Tester',
        address: 'Main Street',
        city: 'Ormoc',
        province: 'Leyte',
      );

      expect(await controller.updateProfile(update), isTrue);
      expect(gateway.profileUpdate, same(update));
    });

    test(
      'prevents duplicate submission while an operation is active',
      () async {
        final completer = Completer<void>();
        final gateway = _FakeGateway(operation: () => completer.future);
        final controller = CustomerAccountController(gateway);
        const preferences = CustomerPrivacyPreferences(
          marketingConsent: true,
          pushNotificationsEnabled: true,
          emailNotificationsEnabled: false,
        );

        final first = controller.updatePreferences(preferences);
        expect(controller.isSubmitting, isTrue);
        expect(await controller.updatePreferences(preferences), isFalse);
        completer.complete();
        expect(await first, isTrue);
        expect(gateway.callCount, 1);
      },
    );

    test('maps reauthentication failures to friendly text', () async {
      final gateway = _FakeGateway(
        error: const CustomerAccountException(
          CustomerAccountFailureKind.recentLoginRequired,
        ),
      );
      final controller = CustomerAccountController(gateway);

      expect(
        await controller.changePassword(
          currentPassword: _testCredential,
          newPassword: _testCredential,
        ),
        isFalse,
      );
      expect(controller.errorMessage, contains('confirm your identity'));
    });

    test(
      'password partial success is explicit and never reported as success',
      () async {
        final controller = CustomerAccountController(
          _FakeGateway(
            error: const CustomerPasswordChangeException(
              sessionsRevoked: false,
              signedOut: true,
            ),
          ),
        );
        expect(
          await controller.changePassword(
            currentPassword: _testCredential,
            newPassword: _testCredential,
          ),
          isFalse,
        );
        expect(controller.passwordChangeIssue?.signedOut, isTrue);
        expect(controller.errorMessage, contains('Your password changed'));
        expect(controller.errorMessage, contains('could not be confirmed'));
      },
    );

    test(
      'password submission remains safe when logout disposes the controller',
      () async {
        final barrier = Completer<void>();
        final controller = CustomerAccountController(
          _FakeGateway(operation: () => barrier.future),
        );
        final result = controller.changePassword(
          currentPassword: _testCredential,
          newPassword: _testCredential,
        );
        controller.dispose();
        barrier.complete();
        expect(await result, isTrue);
      },
    );

    test(
      'password duplicate submission is rejected while the first is pending',
      () async {
        final barrier = Completer<void>();
        final gateway = _FakeGateway(operation: () => barrier.future);
        final controller = CustomerAccountController(gateway);
        final first = controller.changePassword(
          currentPassword: _testCredential,
          newPassword: _testCredential,
        );
        expect(
          await controller.changePassword(
            currentPassword: _testCredential,
            newPassword: _testCredential,
          ),
          isFalse,
        );
        barrier.complete();
        expect(await first, isTrue);
        expect(gateway.callCount, 1);
      },
    );

    test(
      'restored password recovery survives unrelated account operations',
      () async {
        final gateway = _FakeGateway()
          ..recoveryIssue = const CustomerPasswordChangeException(
            sessionsRevoked: false,
            signedOut: false,
            requiresReauthentication: true,
          );
        final controller = CustomerAccountController(gateway);
        await controller.restorePasswordRecovery();
        final issue = controller.passwordChangeIssue;
        expect(issue?.requiresReauthentication, isTrue);
        expect(
          await controller.updatePreferences(
            const CustomerPrivacyPreferences(
              marketingConsent: false,
              pushNotificationsEnabled: false,
              emailNotificationsEnabled: false,
            ),
          ),
          isTrue,
        );
        expect(controller.passwordChangeIssue, same(issue));
        expect(
          await controller.resumePasswordCleanup(
            currentPassword: 'current-working-password',
          ),
          isTrue,
        );
        expect(gateway.cleanupPassword, 'current-working-password');
        expect(controller.passwordChangeIssue, isNull);
      },
    );

    test(
      'cleanup without a recovery-capable gateway never repeats password change',
      () async {
        final gateway = _NoRecoveryGateway();
        final controller = CustomerAccountController(gateway);
        expect(await controller.resumePasswordCleanup(), isFalse);
        expect(gateway.passwordChanges, 0);
        expect(controller.errorMessage, contains('temporarily unavailable'));
      },
    );

    test('Google-only password behavior fails safely', () async {
      final gateway = _FakeGateway(supportsPassword: false);
      final controller = CustomerAccountController(gateway);

      expect(controller.supportsPasswordChanges, isFalse);
      expect(
        await controller.changePassword(
          currentPassword: '',
          newPassword: _testCredential,
        ),
        isFalse,
      );
      expect(controller.errorMessage, contains('Google sign-in'));
    });

    test(
      'email update forwards reauthentication and untrusted email only',
      () async {
        final gateway = _FakeGateway();
        final controller = CustomerAccountController(gateway);

        expect(
          await controller.requestEmailUpdate(
            currentPassword: _testCredential,
            newEmail: 'new@example.test',
          ),
          isTrue,
        );
        expect(gateway.newEmail, 'new@example.test');
        expect(gateway.currentPassword, _testCredential);
      },
    );

    test('deactivation and all-session logout call trusted gateway', () async {
      final gateway = _FakeGateway();
      final controller = CustomerAccountController(gateway);

      expect(
        await controller.deactivate(
          currentPassword: _testCredential,
          reason: 'customer_requested',
        ),
        isTrue,
      );
      expect(gateway.deactivated, isTrue);
      expect(
        await controller.revokeAllSessions(currentPassword: _testCredential),
        isTrue,
      );
      expect(gateway.revokedAllSessions, isTrue);
    });
  });
}

class _NoRecoveryGateway implements CustomerAccountGateway {
  int passwordChanges = 0;
  @override
  bool get supportsPasswordChanges => true;
  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    passwordChanges++;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeGateway
    implements CustomerAccountGateway, CustomerPasswordRecoveryGateway {
  _FakeGateway({this.supportsPassword = true, this.operation, this.error});

  final bool supportsPassword;
  final Future<void> Function()? operation;
  final CustomerAccountException? error;
  int callCount = 0;
  CustomerProfileUpdate? profileUpdate;
  String? newEmail;
  String? currentPassword;
  bool deactivated = false;
  bool revokedAllSessions = false;
  CustomerPasswordChangeException? recoveryIssue;
  String? cleanupPassword;
  @override
  Future<CustomerPasswordChangeException?> loadPasswordRecovery() async =>
      recoveryIssue;
  @override
  Future<void> resumePasswordCleanup({String? currentPassword}) async {
    cleanupPassword = currentPassword;
    await _run();
    recoveryIssue = null;
  }

  @override
  bool get supportsPasswordChanges => supportsPassword;

  Future<void> _run() async {
    callCount += 1;
    if (error != null) throw error!;
    if (operation != null) await operation!();
  }

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    if (!supportsPassword) {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.passwordProviderRequired,
      );
    }
    await _run();
  }

  @override
  Future<void> deactivate({String? currentPassword, String? reason}) async {
    await _run();
    deactivated = true;
  }

  @override
  Future<void> requestEmailUpdate({
    required String currentPassword,
    required String newEmail,
  }) async {
    this.currentPassword = currentPassword;
    this.newEmail = newEmail;
    await _run();
  }

  @override
  Future<void> revokeAllSessions({String? currentPassword}) async {
    await _run();
    revokedAllSessions = true;
  }

  @override
  Future<void> updatePreferences(CustomerPrivacyPreferences preferences) =>
      _run();

  @override
  Future<void> updateProfile(CustomerProfileUpdate update) async {
    profileUpdate = update;
    await _run();
  }
}
