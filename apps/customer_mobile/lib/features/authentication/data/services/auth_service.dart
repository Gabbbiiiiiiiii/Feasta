import 'package:firebase_auth/firebase_auth.dart';

import '../../../../core/security/auth_operation_coordinator.dart';

/// Compatibility wrapper used by the pending-approval screen.
///
/// Registration, role assignment, account lifecycle changes, and provider
/// verification are intentionally not exposed here. Those trusted writes go
/// through [AuthRepository] and callable Cloud Functions.
class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;

  Future<void> logoutUser() {
    final uid = _auth.currentUser?.uid;
    return AuthOperationCoordinator.shared.transition(() async {
      if (_auth.currentUser?.uid == uid) await _auth.signOut();
    });
  }
}
