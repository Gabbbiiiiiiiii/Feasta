import 'package:cloud_functions/cloud_functions.dart';

typedef CustomerBootstrapCall =
    Future<void> Function(String name, Map<String, dynamic>? data);

/// Runs inside the caller's operation queue; never acquires another lock.
class CustomerProfileBootstrap {
  const CustomerProfileBootstrap({
    required this.call,
    required this.checkCurrent,
  });
  final CustomerBootstrapCall call;
  final void Function() checkCurrent;

  Future<void> synchronize() async {
    checkCurrent();
    try {
      await call('syncUserAuthState', null);
    } on FirebaseFunctionsException catch (error) {
      // Only this callable's documented missing user result permits creation.
      if (error.code != 'not-found' ||
          error.message != 'User profile was not found.') {
        rethrow;
      }
      checkCurrent();
      await call('ensureUserProfile', null);
    }
    checkCurrent();
  }
}
