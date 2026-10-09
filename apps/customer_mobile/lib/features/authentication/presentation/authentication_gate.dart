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
      builder: (context, _) {
        return _buildState(context);
      },
    );
  }

  Widget _buildState(BuildContext context) {
    final state = controller.state;
    final kind = state.gate.kind;

    debugPrint(
      'FEASTA AUTH GATE: '
      'kind=$kind '
      'email=${state.email} '
      'destination=${controller.intendedLocation}',
    );

    if (state.failure != null) {
      return _StateScaffold(
        key: const ValueKey('authentication-transient-error'),
        child: FeastaApplicationErrorState(
          kind:
              state.failure ==
                  CustomerAuthenticationFailureKind.network
              ? FeastaErrorKind.connectivity
              : FeastaErrorKind.server,
          onRetry: controller.refresh,
        ),
      );
    }

    final destination = CustomerRouteGuard.resolve(
      gate: kind,
      requestedLocation: controller.intendedLocation,
    );

    //
    // LOADING
    //
    if (kind == AuthenticationGateKind.loading) {
      return const SplashScreen(
        key: ValueKey('authentication-loading'),
      );
    }

    //
    // GUEST / UNAUTHENTICATED
    //
    if (kind == AuthenticationGateKind.unauthenticated) {
      if (destination == CustomerAppLocations.login) {
        return KeyedSubtree(
          key: const ValueKey('authentication-login'),
          child:
              loginBuilder?.call(context, controller) ??
              const LoginScreen(
                canSkip: false,
                managedByAuthenticationGate: true,
              ),
        );
      }

      //
      // IMPORTANT:
      //
      // Give the guest CustomerMainScreen a unique key.
      //
      // This prevents Flutter from reusing the guest CustomerMainScreen
      // when the authentication state later changes to customerReady.
      //
      return KeyedSubtree(
        key: const ValueKey('customer-shell-guest'),
        child:
            publicBuilder?.call(context, controller) ??
            const CustomerMainScreen(
              key: ValueKey('customer-main-guest'),
            ),
      );
    }

    //
    // SESSION EXPIRED
    //
    if (kind == AuthenticationGateKind.sessionExpired) {
      return _StateScaffold(
        key: const ValueKey('authentication-session-expired'),
        child: FeastaApplicationErrorState(
          kind: FeastaErrorKind.sessionExpired,
          onRetry: controller.acknowledgeSessionExpired,
        ),
      );
    }

    //
    // EMAIL VERIFICATION
    //
    if (kind == AuthenticationGateKind.emailVerificationRequired) {
      return KeyedSubtree(
        key: const ValueKey('authentication-email-verification'),
        child:
            verificationBuilder?.call(context, controller) ??
            EmailVerificationScreen(
              email: state.email ?? '',
              managedByAuthenticationGate: true,
            ),
      );
    }

    //
    // CUSTOMER AUTHENTICATED
    //
    if (kind == AuthenticationGateKind.customerReady ||
        kind ==
            AuthenticationGateKind
                .customerPhoneVerificationRequired) {
      if (customerBuilder != null) {
        return KeyedSubtree(
          key: const ValueKey('customer-shell-authenticated'),
          child: customerBuilder!(
            context,
            controller,
          ),
        );
      }

      final intended =
          controller.consumeIntendedLocation();

      debugPrint(
        'FEASTA AUTHENTICATED CUSTOMER: '
        'opening=$intended',
      );

      //
      // IMPORTANT:
      //
      // This key MUST be different from the guest key above.
      //
      // Flutter will therefore dispose the guest CustomerMainScreen and
      // construct a fresh authenticated CustomerMainScreen.
      //
      return CustomerMainScreen(
        key: const ValueKey(
          'customer-main-authenticated',
        ),
        initialIndex: _tabForLocation(
          intended,
        ),
      );
    }

    //
    // MISSING CUSTOMER PROFILE
    //
    if (kind == AuthenticationGateKind.missingUserProfile) {
      final presentation =
          authenticationGatePresentation(kind);

      return _StateScaffold(
        key: const ValueKey(
          'authentication-missing-profile',
        ),
        child: FeastaErrorState(
          title: presentation.label,
          message: presentation.message,
          retryLabel: 'Try again',
          onRetry: controller.refresh,
        ),
      );
    }

    //
    // PROVIDER / ADMIN ACCOUNT USED IN CUSTOMER APP
    //
    if (_isUnsupportedRole(kind)) {
      return _StateScaffold(
        key: const ValueKey(
          'authentication-unsupported-role',
        ),
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

    //
    // OTHER TERMINAL ACCOUNT STATES
    //
    final presentation =
        authenticationGatePresentation(kind);

    return _StateScaffold(
      key: ValueKey(
        'authentication-state-${kind.name}',
      ),
      child: FeastaErrorState(
        title: presentation.label,
        message: presentation.message,
        retryLabel: 'Sign out',
        onRetry: controller.signOut,
      ),
    );
  }

  static bool _isUnsupportedRole(
    AuthenticationGateKind kind,
  ) {
    return kind ==
            AuthenticationGateKind.forbiddenRole ||
        kind ==
            AuthenticationGateKind
                .providerBusinessSetupRequired ||
        kind ==
            AuthenticationGateKind
                .providerVerificationDraft ||
        kind ==
            AuthenticationGateKind
                .providerVerificationSubmitted ||
        kind ==
            AuthenticationGateKind.providerUnderReview ||
        kind ==
            AuthenticationGateKind
                .providerResubmissionRequired ||
        kind ==
            AuthenticationGateKind.providerRejected ||
        kind ==
            AuthenticationGateKind.providerSuspended ||
        kind ==
            AuthenticationGateKind.providerApproved ||
        kind ==
            AuthenticationGateKind.adminReady;
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
  const _StateScaffold({
    required this.child,
    super.key,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            child: child,
          ),
        ),
      ),
    );
  }
}