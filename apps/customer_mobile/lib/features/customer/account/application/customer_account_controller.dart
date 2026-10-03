import 'package:flutter/foundation.dart';

import '../domain/customer_account_management.dart';

class CustomerAccountController extends ChangeNotifier {
  CustomerAccountController(this._gateway);

  final CustomerAccountGateway _gateway;
  bool _isSubmitting = false;
  String? _errorMessage;

  bool get isSubmitting => _isSubmitting;
  String? get errorMessage => _errorMessage;
  bool get supportsPasswordChanges => _gateway.supportsPasswordChanges;

  Future<bool> updateProfile(CustomerProfileUpdate update) =>
      _run(() => _gateway.updateProfile(update));

  Future<bool> updatePreferences(CustomerPrivacyPreferences preferences) =>
      _run(() => _gateway.updatePreferences(preferences));

  Future<bool> changePassword({
    required String currentPassword,
    required String newPassword,
  }) => _run(
    () => _gateway.changePassword(
      currentPassword: currentPassword,
      newPassword: newPassword,
    ),
  );

  Future<bool> requestEmailUpdate({
    required String currentPassword,
    required String newEmail,
  }) => _run(
    () => _gateway.requestEmailUpdate(
      currentPassword: currentPassword,
      newEmail: newEmail,
    ),
  );

  Future<bool> deactivate({String? currentPassword, String? reason}) => _run(
    () => _gateway.deactivate(currentPassword: currentPassword, reason: reason),
  );

  Future<bool> revokeAllSessions({String? currentPassword}) =>
      _run(() => _gateway.revokeAllSessions(currentPassword: currentPassword));

  Future<bool> _run(Future<void> Function() operation) async {
    if (_isSubmitting) return false;
    _isSubmitting = true;
    _errorMessage = null;
    notifyListeners();
    try {
      await operation();
      return true;
    } on CustomerAccountException catch (error) {
      _errorMessage = error.friendlyMessage;
      return false;
    } catch (_) {
      _errorMessage = const CustomerAccountException(
        CustomerAccountFailureKind.unknown,
      ).friendlyMessage;
      return false;
    } finally {
      _isSubmitting = false;
      notifyListeners();
    }
  }
}
