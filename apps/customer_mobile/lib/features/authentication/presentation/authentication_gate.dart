import 'package:flutter/material.dart';

import '../../../app/router/customer_route_guard.dart';
import '../../../core/widgets/widgets.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../customer/customer_main_screen.dart';
import '../../presentation/screens/email_verification_screen.dart';
import '../../presentation/screens/login_screen.dart';
import '../../presentation/screens/legal_document_screen.dart';
import '../../splash/splash_screen.dart';
import '../application/customer_auth_controller.dart';
import 'customer_consent_screen.dart';
import 'authentication_loading.dart';
import '../domain/auth_account_presentation.dart';
import '../domain/auth_account_state.dart';

typedef AuthenticationGateBuilder =
    Widget Function(
      BuildContext context,
      CustomerAuthenticationController controller,
    );

class AuthenticationGate extends StatefulWidget {
  const AuthenticationGate({
    required this.controller,
    this.publicBuilder,
    this.customerBuilder,
    this.loginBuilder,
    this.verificationBuilder,
    this.consentDocumentLoader = loadCurrentLegalDocument,
    super.key,
  });

  final CustomerAuthenticationController controller;

  final AuthenticationGateBuilder? publicBuilder;
  final AuthenticationGateBuilder? customerBuilder;
  final AuthenticationGateBuilder? loginBuilder;
  final AuthenticationGateBuilder? verificationBuilder;
  final LegalDocumentLoader consentDocumentLoader;

  @override
  State<AuthenticationGate> createState() => _AuthenticationGateState();
}

class _AuthenticationGateState extends State<AuthenticationGate> {
  Widget? stableBackground;
  CustomerAuthenticationController get controller => widget.controller;
  AuthenticationGateBuilder? get publicBuilder => widget.publicBuilder;
  AuthenticationGateBuilder? get customerBuilder => widget.customerBuilder;
  AuthenticationGateBuilder? get loginBuilder => widget.loginBuilder;
  AuthenticationGateBuilder? get verificationBuilder =>
      widget.verificationBuilder;
  LegalDocumentLoader get consentDocumentLoader => widget.consentDocumentLoader;

  @override
  void didUpdateWidget(AuthenticationGate oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != controller) stableBackground = null;
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        if (controller.modalSignInActive &&
            !controller.signingOut &&
            stableBackground != null) {
          return stableBackground!;
        }
        final background = _buildState(context);
        stableBackground = background;
        return background;
      },
    );
  }

  Widget _buildState(BuildContext context) {
    final state = controller.state;
    final kind = state.gate.kind;

    if (controller.consentRequired && state.failure == null) {
      final generation = controller.consentGeneration;
      final revision = controller.consentRevision;
      final uid = controller.currentIdentity?.uid;
      return CustomerConsentScreen(
        loader: consentDocumentLoader,
        policiesOutdated: controller.policiesOutdated,
        policyRecoveryNotice: controller.policyRecoveryNotice,
        key: ValueKey('customer-consent-$generation-$revision'),
        onAccept: (termsVersion, privacyVersion) => controller.acceptConsent(
          termsPolicyVersion: termsVersion,
          privacyPolicyVersion: privacyVersion,
          expectedGeneration: generation,
          expectedRevision: revision,
        ),
        onDecline: () async {
          if (generation == controller.consentGeneration &&
              revision == controller.consentRevision &&
              uid == controller.currentIdentity?.uid) {
            await controller.signOut();
          }
        },
      );
    }

    if (state.failure == CustomerAuthenticationFailureKind.accountAccess ||
        state.failure == CustomerAuthenticationFailureKind.callableAccess) {
      return _StateScaffold(
        child: _RecoveryActions(
          controller: controller,
          child: FeastaErrorState(
            title:
                state.failure ==
                    CustomerAuthenticationFailureKind.callableAccess
                ? 'Secure account setup could not be completed'
                : 'Account access could not be completed',
            message: 'Try again. If this continues, contact FEASTA support.',
            retryLabel: 'Try again',
            onRetry: controller.refresh,
          ),
        ),
      );
    }
    if (state.failure != null) {
      return _StateScaffold(
        key: const ValueKey('authentication-transient-error'),
        child: _RecoveryActions(
          controller: controller,
          cancelLabel: 'Cancel sign-in and browse',
          child: FeastaApplicationErrorState(
            kind: state.failure == CustomerAuthenticationFailureKind.network
                ? FeastaErrorKind.connectivity
                : FeastaErrorKind.server,
            onRetry: controller.refresh,
          ),
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
      if (controller.currentIdentity == null && !controller.signingOut) {
        return const SplashScreen();
      }
      return Scaffold(
        key: const ValueKey('authentication-loading'),
        backgroundColor: AppColors.background,
        body: controller.modalSignInActive
            ? const SizedBox.shrink()
            : SafeArea(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AuthenticationLoading(
                          signingOut: controller.signingOut,
                        ),
                        if (!controller.signingOut)
                          TextButton(
                            key: const Key('restoration-sign-out'),
                            onPressed: controller.signOut,
                            child: const Text('Sign out and browse'),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
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
            const CustomerMainScreen(key: ValueKey('customer-main-guest')),
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
        kind == AuthenticationGateKind.customerPhoneVerificationRequired) {
      if (customerBuilder != null) {
        return KeyedSubtree(
          key: const ValueKey('customer-shell-authenticated'),
          child: customerBuilder!(context, controller),
        );
      }

      final intended = controller.intendedLocation;

      //
      // IMPORTANT:
      //
      // This key MUST be different from the guest key above.
      //
      // Flutter will therefore dispose the guest CustomerMainScreen and
      // construct a fresh authenticated CustomerMainScreen.
      //
      return CustomerMainScreen(
        key: const ValueKey('customer-main-authenticated'),
        initialIndex: _tabForLocation(intended),
      );
    }

    //
    // MISSING CUSTOMER PROFILE
    //
    if (kind == AuthenticationGateKind.missingUserProfile) {
      final presentation = authenticationGatePresentation(kind);

      return _StateScaffold(
        key: const ValueKey('authentication-missing-profile'),
        child: _RecoveryActions(
          controller: controller,
          child: FeastaErrorState(
            title: presentation.label,
            message: presentation.message,
            retryLabel: 'Try again',
            onRetry: controller.refresh,
          ),
        ),
      );
    }

    //
    // PROVIDER / ADMIN ACCOUNT USED IN CUSTOMER APP
    //
    if (_isUnsupportedRole(kind)) {
      return _StateScaffold(
        key: const ValueKey('authentication-unsupported-role'),
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
    final presentation = authenticationGatePresentation(kind);

    return _StateScaffold(
      key: ValueKey('authentication-state-${kind.name}'),
      child: FeastaErrorState(
        title: presentation.label,
        message: presentation.message,
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
      CustomerAppLocations.messages => 3,
      CustomerAppLocations.account => 4,
      _ => 0,
    };
  }
}

class _RecoveryActions extends StatelessWidget {
  const _RecoveryActions({
    required this.controller,
    required this.child,
    this.cancelLabel = 'Sign out and browse as guest',
  });
  final CustomerAuthenticationController controller;
  final Widget child;
  final String cancelLabel;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      child,
      TextButton(
        onPressed: controller.signingOut ? null : controller.signOut,
        child: Text(cancelLabel),
      ),
    ],
  );
}

class _StateScaffold extends StatelessWidget {
  const _StateScaffold({required this.child, super.key});

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
