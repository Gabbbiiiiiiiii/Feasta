import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../features/authentication/application/customer_auth_controller.dart';
import '../features/authentication/application/customer_auth_scope.dart';
import '../features/authentication/data/repositories/customer_auth_state_repository.dart';
import '../features/authentication/presentation/authentication_gate.dart';
import '../features/onboarding/onboarding_gate.dart';
import '../features/splash/opening_animation.dart';
import 'router/customer_route_guard.dart';
import 'startup_shell.dart';
import '../features/authentication/domain/auth_account_state.dart';

class FeastaApp extends StatefulWidget {
  const FeastaApp({
    this.authenticationController,
    this.initialLocation = '/browse',
    this.startupPresentation,
    super.key,
  });

  final CustomerAuthenticationController? authenticationController;
  final String initialLocation;
  final StartupPresentation? startupPresentation;

  @override
  State<FeastaApp> createState() => _FeastaAppState();
}

class _FeastaAppState extends State<FeastaApp> {
  late final CustomerAuthenticationController _controller;
  late final bool _ownsController;
  bool _onboardingLoaded = false;
  bool _needsOnboarding = false;

  @override
  void initState() {
    super.initState();

    _ownsController = widget.authenticationController == null;

    _controller =
        widget.authenticationController ??
        CustomerAuthenticationController(
          repository: FirebaseCustomerAuthStateRepository(),
          initialLocation: widget.initialLocation,
        );

    _controller.start();
    _controller.addListener(_reportStartup);
    _reportStartup();
  }

  void _reportStartup() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      widget.startupPresentation?.update(
        ready:
            _onboardingLoaded &&
            (_needsOnboarding ||
                _controller.state.failure != null ||
                _controller.state.gate.kind != AuthenticationGateKind.loading ||
                _controller.consentRequired),
        browse: _controller.signOut,
      );
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void dispose() {
    _controller.removeListener(_reportStartup);
    if (_ownsController) {
      _controller.dispose();
    }

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return CustomerAuthenticationScope(
      controller: _controller,
      child: MaterialApp(
        title: 'Feasta',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        builder: widget.startupPresentation == null
            ? (context, child) => OpeningAnimation(child: child!)
            : null,
        home: OnboardingGate(
          onLoaded: (completed) {
            _onboardingLoaded = true;
            _needsOnboarding = !completed;
            _reportStartup();
          },
          onFirstOnboardingCompleted: () {
            _controller.requestIntendedLocation(CustomerAppLocations.browse);
          },
          // Restoration and onboarding run immediately, but the destination's
          // initial build/layout must not compete with the utensil flight.
          child: Builder(
            builder: (context) => OpeningDestination.shouldPrepare(context)
                ? AuthenticationGate(controller: _controller)
                : const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }
}
