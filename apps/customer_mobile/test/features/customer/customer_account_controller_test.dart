import 'dart:async';

import 'package:feasta/features/customer/account/application/customer_account_controller.dart';
import 'package:feasta/features/customer/account/domain/customer_account_management.dart';
import 'package:flutter_test/flutter_test.dart';

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
          currentPassword: 'old password',
          newPassword: 'new password',
        ),
        isFalse,
      );
      expect(controller.errorMessage, contains('confirm your identity'));
    });

    test('Google-only password behavior fails safely', () async {
      final gateway = _FakeGateway(supportsPassword: false);
      final controller = CustomerAccountController(gateway);

      expect(controller.supportsPasswordChanges, isFalse);
      expect(
        await controller.changePassword(
          currentPassword: '',
          newPassword: 'new password',
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
            currentPassword: 'current password',
            newEmail: 'new@example.test',
          ),
          isTrue,
        );
        expect(gateway.newEmail, 'new@example.test');
        expect(gateway.currentPassword, 'current password');
      },
    );

    test('deactivation and all-session logout call trusted gateway', () async {
      final gateway = _FakeGateway();
      final controller = CustomerAccountController(gateway);

      expect(
        await controller.deactivate(
          currentPassword: 'password',
          reason: 'customer_requested',
        ),
        isTrue,
      );
      expect(gateway.deactivated, isTrue);
      expect(
        await controller.revokeAllSessions(currentPassword: 'password'),
        isTrue,
      );
      expect(gateway.revokedAllSessions, isTrue);
    });
  });
}

class _FakeGateway implements CustomerAccountGateway {
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
