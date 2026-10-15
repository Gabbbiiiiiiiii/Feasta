import 'package:flutter/material.dart';

import '../../../app/router/customer_route_guard.dart';
import '../../../core/theme/app_colors.dart';
import '../../authentication/application/customer_auth_scope.dart';
import '../../authentication/domain/customer_login.dart';
import '../../authentication/domain/auth_account_state.dart';
import '../screens/forgot_password_screen.dart';
import '../screens/role_selection_screen.dart';
import 'customer_login_panel.dart';

Future<bool> showCustomerLoginModal(
  BuildContext context, {
  String intendedLocation = CustomerAppLocations.login,
  String? contextMessage,
}) async {
  final authenticationController = CustomerAuthenticationScope.maybeOf(context);

  final rootNavigator = Navigator.of(context, rootNavigator: true);

  //
  // Remember where the customer was trying to go.
  //
  // We stage this while the user is still unauthenticated so
  // AuthenticationGate does not immediately replace the public shell.
  //
  authenticationController?.stageIntendedLocation(intendedLocation);

  final result = await showModalBottomSheet<bool>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    isDismissible: true,
    enableDrag: true,
    useSafeArea: false,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.46),
    sheetAnimationStyle: const AnimationStyle(
      duration: Duration(milliseconds: 380),
      reverseDuration: Duration(milliseconds: 300),
    ),
    builder: (sheetContext) {
      final mediaQuery = MediaQuery.of(sheetContext);

      return Padding(
        padding: EdgeInsets.only(top: mediaQuery.padding.top + 12),
        child: FractionallySizedBox(
          heightFactor: 0.94,
          alignment: Alignment.bottomCenter,
          child: Material(
            color: AppColors.background,
            elevation: 20,
            clipBehavior: Clip.antiAlias,
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(28),
                topRight: Radius.circular(28),
              ),
            ),
            child: AnimatedPadding(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutCubic,
              padding: EdgeInsets.only(bottom: mediaQuery.viewInsets.bottom),
              child: SafeArea(
                top: false,
                child: SingleChildScrollView(
                  physics: const ClampingScrollPhysics(),
                  child: CustomerLoginPanel(
                    contextMessage: contextMessage,

                    //
                    // CLOSE
                    //
                    onClose: () {
                      Navigator.of(sheetContext).pop(false);
                    },

                    //
                    // FORGOT PASSWORD
                    //
                    onForgotPassword: () {
                      Navigator.of(sheetContext).pop(false);

                      rootNavigator.push(
                        MaterialPageRoute(
                          builder: (_) => const ForgotPasswordScreen(),
                        ),
                      );
                    },

                    //
                    // CREATE ACCOUNT
                    //
                    onCreateAccount: () {
                      Navigator.of(sheetContext).pop(false);

                      rootNavigator.push(
                        MaterialPageRoute(
                          builder: (_) => const RoleSelectionScreen(),
                        ),
                      );
                    },

                    //
                    // LOGIN COMPLETE
                    //
                    onLoginComplete: (CustomerLoginResult loginResult) async {
                      if (authenticationController == null) {
                        if (sheetContext.mounted) {
                          Navigator.of(sheetContext).pop(false);
                        }
                        return;
                      }
                      authenticationController.stageIntendedLocation(
                        intendedLocation,
                      );
                      await authenticationController.refresh(
                        forceTokenRefresh: false,
                      );
                      final kind = authenticationController.state.gate.kind;
                      final ready =
                          authenticationController.currentIdentity?.uid ==
                              loginResult.uid &&
                          (kind == AuthenticationGateKind.customerReady ||
                              kind ==
                                  AuthenticationGateKind
                                      .customerPhoneVerificationRequired);
                      if (sheetContext.mounted) {
                        Navigator.of(sheetContext).pop(ready);
                      }
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    },
  );

  //
  // X button, swipe down, barrier tap, or system back:
  // return to public browsing.
  //
  if (result != true && authenticationController?.currentIdentity == null) {
    authenticationController?.stageIntendedLocation(
      CustomerAppLocations.browse,
    );
  }

  return result == true;
}
