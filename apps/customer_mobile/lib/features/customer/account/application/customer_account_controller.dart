import 'package:flutter/foundation.dart';

import '../domain/customer_account_management.dart';

class CustomerAccountController extends ChangeNotifier {
  CustomerAccountController(this._gateway);

  final CustomerAccountGateway _gateway;
  bool _isSubmitting = false;
  String? _errorMessage;
  CustomerPasswordChangeException? _passwordChangeIssue;
  bool _disposed = false;

  bool get isSubmitting => _isSubmitting;
  String? get errorMessage => _errorMessage;
  CustomerPasswordChangeException? get passwordChangeIssue =>
      _passwordChangeIssue;
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
    passwordOperation: true,
  );

  Future<void> restorePasswordRecovery() async {
    final gateway = _gateway;
    if (_disposed ||
        _isSubmitting ||
        gateway is! CustomerPasswordRecoveryGateway) {
      return;
    }
    try {
      _passwordChangeIssue = await (gateway as CustomerPasswordRecoveryGateway)
          .loadPasswordRecovery();
      if (!_disposed) notifyListeners();
    } catch (_) {
      _errorMessage =
          'Account recovery could not be loaded. Retry before changing your password.';
      if (!_disposed) notifyListeners();
    }
  }

  Future<bool> resumePasswordCleanup({String? currentPassword}) {
    final gateway = _gateway;
    if (gateway is CustomerPasswordRecoveryGateway) {
      return _run(
        () => (gateway as CustomerPasswordRecoveryGateway)
            .resumePasswordCleanup(currentPassword: currentPassword),
        passwordOperation: true,
      );
    }
    return _run(() async {
      throw const CustomerAccountException(
        CustomerAccountFailureKind.configuration,
      );
    });
  }

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

  Future<bool> _run(
    Future<void> Function() operation, {
    bool passwordOperation = false,
  }) async {
    if (_isSubmitting || _disposed) return false;
    _isSubmitting = true;
    _errorMessage = null;
    if (!_disposed) notifyListeners();
    try {
      await operation();
      if (passwordOperation) _passwordChangeIssue = null;
      return true;
    } on CustomerAccountException catch (error) {
      if (error is CustomerPasswordChangeException) {
        _passwordChangeIssue = error;
      }
      _errorMessage = error.friendlyMessage;
      return false;
    } catch (_) {
      _errorMessage = const CustomerAccountException(
        CustomerAccountFailureKind.unknown,
      ).friendlyMessage;
      return false;
    } finally {
      _isSubmitting = false;
      if (!_disposed) notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
