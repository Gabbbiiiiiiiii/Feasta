import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/router/customer_route_guard.dart';
import '../../../core/theme/app_colors.dart';
import '../../authentication/application/customer_auth_scope.dart';
import '../../authentication/data/repositories/auth_repository.dart';
import '../../authentication/domain/customer_login.dart';
import '../../customer/customer_main_screen.dart';
import '../widgets/customer_login_panel.dart';
import 'email_verification_screen.dart';
import 'forgot_password_screen.dart';
import 'role_selection_screen.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({
    this.canSkip = true,
    this.redirectAfterLogin,
    this.managedByAuthenticationGate = false,
    this.loginGateway,
    this.onLoginComplete,
    super.key,
  });

  final bool canSkip;
  final Widget? redirectAfterLogin;
  final bool managedByAuthenticationGate;
  final CustomerLoginGateway? loginGateway;

  final FutureOr<void> Function(CustomerLoginResult result)? onLoginComplete;

  Future<void> _handleLoginComplete(
    BuildContext context,
    CustomerLoginResult result,
  ) async {
    if (onLoginComplete != null) {
      await onLoginComplete!(result);
      return;
    }

    if (managedByAuthenticationGate) {
      await CustomerAuthenticationScope.of(context).refresh();

      return;
    }

    if (!result.emailVerified) {
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => EmailVerificationScreen(email: result.email ?? ''),
        ),
        (_) => false,
      );

      return;
    }

    final destination = redirectAfterLogin ?? const CustomerMainScreen();

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => destination),
      (_) => false,
    );
  }

  void _continueAsGuest(BuildContext context) {
    if (managedByAuthenticationGate) {
      final controller = CustomerAuthenticationScope.maybeOf(context);

      if (controller != null) {
        controller.requestIntendedLocation(CustomerAppLocations.browse);

        return;
      }
    }

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const CustomerMainScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          child: CustomerLoginPanel(
            loginGateway: loginGateway ?? AuthRepository(),
            onClose: canSkip ? () => _continueAsGuest(context) : null,
            onForgotPassword: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ForgotPasswordScreen()),
              );
            },
            onCreateAccount: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const RoleSelectionScreen()),
              );
            },
            onLoginComplete: (result) => _handleLoginComplete(context, result),
          ),
        ),
      ),
    );
  }
}
