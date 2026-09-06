import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../app/router/customer_route_guard.dart';
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
  if (FirebaseAuth.instance.currentUser != null) {
    return true;
  }

  return showCustomerLoginModal(
    context,
    intendedLocation: intendedLocation,
    contextMessage: message,
  );
}
