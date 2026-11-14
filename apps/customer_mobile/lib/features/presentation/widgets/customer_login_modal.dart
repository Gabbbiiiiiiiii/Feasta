import '../../../core/security/auth_timing.dart';
import 'package:flutter/material.dart';

import '../../../app/router/customer_route_guard.dart';
import '../../../core/theme/app_colors.dart';
import '../../authentication/application/customer_auth_scope.dart';
import '../../authentication/application/customer_auth_controller.dart';
import '../../authentication/domain/customer_login.dart';
import '../../authentication/domain/auth_account_state.dart';
import '../screens/forgot_password_screen.dart';
import '../screens/role_selection_screen.dart';
import 'customer_login_panel.dart';
import '../../authentication/presentation/authentication_loading.dart';

Future<bool> showCustomerLoginModal(
  BuildContext context, {
  String intendedLocation = CustomerAppLocations.login,
  String? contextMessage,
  CustomerLoginGateway? loginGateway,
}) async {
  final authenticationController = CustomerAuthenticationScope.maybeOf(context);

  if (authenticationController?.modalSignInActive == true) return false;

  final rootNavigator = Navigator.of(context, rootNavigator: true);
  final animation = BottomSheet.createAnimationController(rootNavigator);

  //
  // Remember where the customer was trying to go.
  //
  // We stage this while the user is still unauthenticated so
  // AuthenticationGate does not immediately replace the public shell.
  //
  authenticationController?.stageIntendedLocation(
    CustomerAppLocations.customer,
  );

  final submitting = ValueNotifier<bool>(false);
  final interacting = ValueNotifier<bool>(false);

  var modalOpen = true;
  authenticationController?.modalSignInActive = true;
  bool? result;
  ModalRoute<dynamic>? activeRoute;
  try {
    result = await showModalBottomSheet<bool>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      isDismissible: true,
      // The coordinated BottomSheet below enables drag only while idle.
      enableDrag: false,
      transitionAnimationController: animation,
      useSafeArea: false,
      backgroundColor: Colors.transparent,
      barrierColor: AppColors.overlay,
      sheetAnimationStyle: const AnimationStyle(
        duration: Duration(milliseconds: 380),
        reverseDuration: Duration(milliseconds: 300),
      ),
      builder: (sheetContext) {
        final mediaQuery = MediaQuery.of(sheetContext);
        final sheetRoute = ModalRoute.of(sheetContext);
        activeRoute = sheetRoute;
        bool closeSheet() {
          if (!sheetContext.mounted || sheetRoute?.isCurrent != true) {
            return false;
          }
          Navigator.of(sheetContext).pop(false);
          return true;
        }

        return _CoordinatedLoginSheet(
          animation: animation,
          controller: authenticationController,
          submitting: submitting,
          interacting: interacting,
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
                  loginGateway: loginGateway,
                  onInteractionChanged: (value) {
                    if (modalOpen) interacting.value = value;
                  },
                  onSubmittingChanged: (value) {
                    if (modalOpen) submitting.value = value;
                  },

                  //
                  // CLOSE
                  //
                  onClose: () {
                    closeSheet();
                  },

                  //
                  // FORGOT PASSWORD
                  //
                  onForgotPassword: () {
                    if (!closeSheet() || !rootNavigator.mounted) return;

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
                    if (!closeSheet() || !rootNavigator.mounted) return;

                    rootNavigator.push(
                      MaterialPageRoute(
                        builder: (_) => const RoleSelectionScreen(),
                      ),
                    );
                  },

                  //
                  // LOGIN COMPLETE
                  //
                  onLoginComplete: (loginResult) async {
                    // Auth streams normally start this load. Only fill the gap
                    // when the credential result arrives before those streams.
                    final controller = authenticationController;
                    if (sheetContext.mounted &&
                        controller != null &&
                        controller.currentIdentity?.uid == loginResult.uid &&
                        !controller.loadingAccount &&
                        controller.state.gate.kind ==
                            AuthenticationGateKind.unauthenticated) {
                      await controller.refresh(forceTokenRefresh: false);
                    }
                  },
                ),
              ),
            ),
          ),
        );
      },
    );
  } finally {
    modalOpen = false;
    // Keep the supplied controller alive through the route's reverse animation.
    await activeRoute?.completed;
    submitting.dispose();
    interacting.dispose();
    animation.dispose();
    authenticationController?.endModalSignIn();
  }
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

/// Owns only this sheet route; auth completion must never pop another route.
class _CoordinatedLoginSheet extends StatefulWidget {
  const _CoordinatedLoginSheet({
    required this.animation,
    required this.controller,
    required this.child,
    required this.submitting,
    required this.interacting,
  });
  final CustomerAuthenticationController? controller;
  final AnimationController animation;
  final Widget child;
  final ValueNotifier<bool> submitting;
  final ValueNotifier<bool> interacting;

  @override
  State<_CoordinatedLoginSheet> createState() => _CoordinatedLoginSheetState();
}

class _CoordinatedLoginSheetState extends State<_CoordinatedLoginSheet> {
  bool _observedIdentity = false;
  bool _closed = false;
  bool _retrying = false;

  @override
  void initState() {
    super.initState();
    widget.controller?.addListener(_changed);
    widget.submitting.addListener(_changed);
    widget.interacting.addListener(_changed);
    _observedIdentity = widget.controller?.currentIdentity != null;
    WidgetsBinding.instance.addPostFrameCallback((_) => _complete());
  }

  void _changed() {
    if (!mounted || _closed) return;
    _observedIdentity |= widget.controller?.currentIdentity != null;
    setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) => _complete());
  }

  void _complete() {
    if (!mounted || _closed || !_observedIdentity) return;
    final controller = widget.controller!;
    final state = controller.state;
    if (controller.signingOut || state.failure != null) return;
    if (controller.loadingAccount &&
        state.gate.kind != AuthenticationGateKind.unauthenticated &&
        state.gate.kind != AuthenticationGateKind.sessionExpired) {
      return;
    }
    if (state.gate.kind == AuthenticationGateKind.loading &&
        state.failure == null &&
        !controller.consentRequired) {
      return;
    }
    final route = ModalRoute.of(context);
    if (route == null || !route.isActive) return;
    _closed = true;
    final ready =
        state.failure == null &&
        (state.gate.kind == AuthenticationGateKind.customerReady ||
            state.gate.kind ==
                AuthenticationGateKind.customerPhoneVerificationRequired);
    final watch = AuthTiming.start();
    if (ready) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        AuthTiming.finish('authorized_to_home_frame', watch);
      });
    }
    if (route.isCurrent) {
      Navigator.of(context).pop(ready);
    } else {
      Navigator.of(context).removeRoute(route, ready);
    }
  }

  @override
  void dispose() {
    widget.controller?.removeListener(_changed);
    widget.submitting.removeListener(_changed);
    widget.interacting.removeListener(_changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final failure = controller?.state.failure;
    final recovering = _retrying || (controller?.loadingAccount ?? false);
    final busy =
        widget.submitting.value ||
        (_observedIdentity && (failure == null || recovering));
    return PopScope(
      canPop: !busy && !widget.interacting.value,
      child: BottomSheet(
        animationController: widget.animation,
        enableDrag: !busy && !widget.interacting.value,
        showDragHandle: false,
        backgroundColor: Colors.transparent,
        onClosing: () {
          if (!busy && !widget.interacting.value) {
            Navigator.of(context).maybePop();
          }
        },
        builder: (context) => Padding(
          padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top + 12),
          child: FractionallySizedBox(
            heightFactor: 0.94,
            alignment: Alignment.bottomCenter,
            child: Material(
              key: const Key('customer-login-sheet-surface'),
              color: AppColors.background,
              elevation: 20,
              clipBehavior: Clip.antiAlias,
              shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(28),
                  topRight: Radius.circular(28),
                ),
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Offstage(
                    offstage: busy || failure != null,
                    child: widget.child,
                  ),
                  Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    child: SizedBox(
                      key: const Key('customer-login-drag-handle'),
                      height: 24,
                      child: Center(
                        child: Container(
                          width: 36,
                          height: 4,
                          decoration: BoxDecoration(
                            color: AppColors.border,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (busy)
                    Center(
                      child: ConstrainedBox(
                        key: const Key('finishing-sign-in-dialog'),
                        constraints: const BoxConstraints(maxWidth: 320),
                        child: AuthenticationLoading(
                          signingOut: controller?.signingOut ?? false,
                        ),
                      ),
                    )
                  else if (failure != null)
                    Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 360),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                failure ==
                                        CustomerAuthenticationFailureKind
                                            .network
                                    ? 'Unable to connect'
                                    : failure ==
                                          CustomerAuthenticationFailureKind
                                              .server
                                    ? 'Sign-in is temporarily unavailable'
                                    : 'Account access could not be completed',
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                failure ==
                                        CustomerAuthenticationFailureKind
                                            .network
                                    ? 'Check your connection and try again. Your session has been kept safe.'
                                    : 'Try again. If this continues, contact FEASTA support.',
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: _retry,
                                child: const Text('Retry sign-in'),
                              ),
                              TextButton(
                                onPressed: () {
                                  final route = ModalRoute.of(context);
                                  if (route?.isCurrent == true && !_closed) {
                                    _closed = true;
                                    Navigator.of(context).pop(false);
                                  }
                                },
                                child: const Text('Back'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _retry() async {
    final controller = widget.controller;
    if (_retrying || controller == null || _closed) return;
    setState(() => _retrying = true);
    try {
      await controller.refresh(forceTokenRefresh: false);
    } finally {
      if (mounted) {
        setState(() => _retrying = false);
        _complete();
      }
    }
  }
}
