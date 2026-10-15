import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/router/customer_route_guard.dart';
import '../../../app/router/customer_auth_navigation.dart';
import '../../../core/theme/app_colors.dart';
import '../../authentication/application/customer_auth_scope.dart';
import '../../authentication/data/repositories/auth_repository.dart';
import '../../authentication/domain/customer_login.dart';
import '../../authentication/domain/account_recovery.dart';
import '../widgets/customer_login_panel.dart';
import 'forgot_password_screen.dart';
import 'role_selection_screen.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({
    this.canSkip = true,
    this.redirectAfterLogin,
    this.managedByAuthenticationGate = false,
    this.loginGateway,
    this.onLoginComplete,
    this.passwordResetGateway,
    this.roleSelectionBuilder,
    super.key,
  });

  final bool canSkip;
  final Widget? redirectAfterLogin;
  final bool managedByAuthenticationGate;
  final CustomerLoginGateway? loginGateway;
  final PasswordResetGateway? passwordResetGateway;
  final WidgetBuilder? roleSelectionBuilder;

  final FutureOr<void> Function(CustomerLoginResult result)? onLoginComplete;

  Future<void> _handleLoginComplete(
    BuildContext context,
    CustomerLoginResult result,
  ) async {
    if (onLoginComplete != null) {
      await onLoginComplete!(result);
      return;
    }

    final controller = CustomerAuthenticationScope.maybeOf(context);
    if (controller != null) {
      await controller.refresh(forceTokenRefresh: false);
      if (context.mounted && !managedByAuthenticationGate) {
        returnToCustomerAuthenticationGate(context);
      }
      return;
    }

    // A standalone login cannot establish customer authorization by itself.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Account access could not be completed. Reopen FEASTA to continue.',
        ),
      ),
    );
  }

  Future<void> _continueAsGuest(BuildContext context) async {
    final controller = CustomerAuthenticationScope.maybeOf(context);
    if (controller == null) return;
    if (controller.currentIdentity != null) await controller.signOut();
    if (!context.mounted || controller.currentIdentity != null) return;
    returnToCustomerAuthenticationGate(
      context,
      intendedLocation: CustomerAppLocations.browse,
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
                MaterialPageRoute(
                  builder: (_) =>
                      ForgotPasswordScreen(resetGateway: passwordResetGateway),
                ),
              );
            },
            onCreateAccount: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder:
                      roleSelectionBuilder ??
                      (_) => const RoleSelectionScreen(),
                ),
              );
            },
            onLoginComplete: (result) => _handleLoginComplete(context, result),
          ),
        ),
      ),
    );
  }
}
