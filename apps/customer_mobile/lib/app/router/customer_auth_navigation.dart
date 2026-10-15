import 'package:flutter/material.dart';

import '../../features/authentication/application/customer_auth_scope.dart';
import '../../features/authentication/domain/auth_account_state.dart';
import 'customer_route_guard.dart';

/// Authentication flows return to the persistent gate-owning root route.
/// They must never replace that route with a login or customer screen.
bool returnToCustomerAuthenticationGate(
  BuildContext context, {
  String? intendedLocation,
}) {
  final controller = CustomerAuthenticationScope.maybeOf(context);
  if (controller == null) return false;
  if (intendedLocation != null) {
    // A protected destination already routes guests to login. Retain that
    // destination when returning from password recovery.
    final alreadyRequestsLogin =
        CustomerRouteGuard.resolve(
          gate: AuthenticationGateKind.unauthenticated,
          requestedLocation: controller.intendedLocation,
        ) ==
        CustomerAppLocations.login;
    if (intendedLocation != CustomerAppLocations.login ||
        !alreadyRequestsLogin) {
      controller.requestIntendedLocation(intendedLocation);
    }
  }
  Navigator.of(context, rootNavigator: true).popUntil((route) => route.isFirst);
  return true;
}
