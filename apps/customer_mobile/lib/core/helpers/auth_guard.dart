import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../app/router/customer_route_guard.dart';
import '../../features/authentication/application/customer_auth_scope.dart';
import '../../features/authentication/domain/auth_account_state.dart';
import '../../features/presentation/widgets/customer_login_modal.dart';

bool get isGuestUser {
  return FirebaseAuth.instance.currentUser == null;
}

Future<bool> requireLogin(
  BuildContext context, {
  String message = 'Log in or create a Feasta account to continue.',
  Widget? redirectAfterLogin,
  String intendedLocation = CustomerAppLocations.login,
}) async {
  final controller = CustomerAuthenticationScope.maybeOf(context);
  if (controller?.currentIdentity != null) {
    controller!.stageIntendedLocation(intendedLocation);
    await controller.refresh(forceTokenRefresh: false);
    final kind = controller.state.gate.kind;
    return context.mounted &&
        (kind == AuthenticationGateKind.customerReady ||
            kind == AuthenticationGateKind.customerPhoneVerificationRequired);
  }
  if (!context.mounted) return false;

  return showCustomerLoginModal(
    context,
    intendedLocation: intendedLocation,
    contextMessage: message,
  );
}
