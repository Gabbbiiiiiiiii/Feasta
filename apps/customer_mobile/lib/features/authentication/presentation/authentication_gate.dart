import 'package:flutter/material.dart';

import '../../../app/router/customer_route_guard.dart';
import '../../../core/widgets/widgets.dart';
import '../../customer/customer_main_screen.dart';
import '../../presentation/screens/email_verification_screen.dart';
import '../../presentation/screens/login_screen.dart';
import '../../splash/splash_screen.dart';
import '../application/customer_auth_controller.dart';
import '../domain/auth_account_presentation.dart';
import '../domain/auth_account_state.dart';

typedef AuthenticationGateBuilder =
    Widget Function(
      BuildContext context,
      CustomerAuthenticationController controller,
    );

class AuthenticationGate extends StatelessWidget {
  const AuthenticationGate({
    required this.controller,
    this.publicBuilder,
    this.customerBuilder,
    this.loginBuilder,
    this.verificationBuilder,
    super.key,
  });

  final CustomerAuthenticationController controller;
  final AuthenticationGateBuilder? publicBuilder;
  final AuthenticationGateBuilder? customerBuilder;
  final AuthenticationGateBuilder? loginBuilder;
  final AuthenticationGateBuilder? verificationBuilder;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) => _buildState(context),
    );
  }

  Widget _buildState(BuildContext context) {
    final state = controller.state;
    if (state.failure != null) {
      return _StateScaffold(
        child: FeastaApplicationErrorState(
          kind: state.failure == CustomerAuthenticationFailureKind.network
              ? FeastaErrorKind.connectivity
              : FeastaErrorKind.server,
          onRetry: controller.refresh,
        ),
      );
    }

    final kind = state.gate.kind;
    final destination = CustomerRouteGuard.resolve(
      gate: kind,
      requestedLocation: controller.intendedLocation,
    );

    if (kind == AuthenticationGateKind.loading) return const SplashScreen();

    if (kind == AuthenticationGateKind.unauthenticated) {
      if (destination == CustomerAppLocations.login) {
        return loginBuilder?.call(context, controller) ??
            const LoginScreen(
              canSkip: false,
              managedByAuthenticationGate: true,
            );
      }
      return publicBuilder?.call(context, controller) ??
          const CustomerMainScreen();
    }

    if (kind == AuthenticationGateKind.sessionExpired) {
      return _StateScaffold(
        child: FeastaApplicationErrorState(
          kind: FeastaErrorKind.sessionExpired,
          onRetry: controller.acknowledgeSessionExpired,
        ),
      );
    }

    if (kind == AuthenticationGateKind.emailVerificationRequired) {
      return verificationBuilder?.call(context, controller) ??
          EmailVerificationScreen(
            email: state.email ?? '',
            managedByAuthenticationGate: true,
          );
    }

    if (kind == AuthenticationGateKind.customerReady ||
        kind == AuthenticationGateKind.customerPhoneVerificationRequired) {
      if (customerBuilder != null) {
        return customerBuilder!(context, controller);
      }
      final intended = controller.consumeIntendedLocation();
      return CustomerMainScreen(initialIndex: _tabForLocation(intended));
    }

    if (kind == AuthenticationGateKind.missingUserProfile) {
      final presentation = authenticationGatePresentation(kind);
      return _StateScaffold(
        child: FeastaErrorState(
          title: presentation.label,
          message: presentation.message,
          retryLabel: 'Try again',
          onRetry: controller.refresh,
        ),
      );
    }

    if (_isUnsupportedRole(kind)) {
      return _StateScaffold(
        child: FeastaErrorState(
          title: 'Use the correct FEASTA app',
          message:
              'This customer app cannot open provider or administrator '
              'accounts. Your stored role has not been changed.',
          retryLabel: 'Sign out',
          onRetry: controller.signOut,
        ),
      );
    }

    return _StateScaffold(
      child: FeastaErrorState(
        title: authenticationGatePresentation(kind).label,
        message: authenticationGatePresentation(kind).message,
        retryLabel: 'Sign out',
        onRetry: controller.signOut,
      ),
    );
  }

  static bool _isUnsupportedRole(AuthenticationGateKind kind) {
    return kind == AuthenticationGateKind.forbiddenRole ||
        kind == AuthenticationGateKind.providerBusinessSetupRequired ||
        kind == AuthenticationGateKind.providerVerificationDraft ||
        kind == AuthenticationGateKind.providerVerificationSubmitted ||
        kind == AuthenticationGateKind.providerUnderReview ||
        kind == AuthenticationGateKind.providerResubmissionRequired ||
        kind == AuthenticationGateKind.providerRejected ||
        kind == AuthenticationGateKind.providerSuspended ||
        kind == AuthenticationGateKind.providerApproved ||
        kind == AuthenticationGateKind.adminReady;
  }

  static int _tabForLocation(String location) {
    return switch (location) {
      CustomerAppLocations.bookings => 2,
      CustomerAppLocations.favorites => 3,
      CustomerAppLocations.account => 4,
      _ => 0,
    };
  }
}

class _StateScaffold extends StatelessWidget {
  const _StateScaffold({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(child: SingleChildScrollView(child: child)),
      ),
    );
  }
}
