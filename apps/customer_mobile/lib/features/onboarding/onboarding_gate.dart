import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../splash/splash_screen.dart';
import 'onboarding_screen.dart';

class OnboardingGate extends StatefulWidget {
  const OnboardingGate({
    required this.child,
    this.onFirstOnboardingCompleted,
    super.key,
  });

  final Widget child;

  final VoidCallback? onFirstOnboardingCompleted;

  @override
  State<OnboardingGate> createState() => _OnboardingGateState();
}

class _OnboardingGateState extends State<OnboardingGate> {
  bool? _hasCompletedOnboarding;

  @override
  void initState() {
    super.initState();

    _loadOnboardingState();
  }

  Future<void> _loadOnboardingState() async {
    final preferences = await SharedPreferences.getInstance();

    final hasCompletedOnboarding =
        preferences.getBool(OnboardingScreen.seenOnboardingKey) ?? false;

    if (!mounted) return;

    setState(() {
      _hasCompletedOnboarding = hasCompletedOnboarding;
    });
  }

  Future<void> _completeOnboarding() async {
    final preferences = await SharedPreferences.getInstance();

    await preferences.setBool(OnboardingScreen.seenOnboardingKey, true);

    if (!mounted) return;

    widget.onFirstOnboardingCompleted?.call();

    setState(() {
      _hasCompletedOnboarding = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final hasCompletedOnboarding = _hasCompletedOnboarding;

    if (hasCompletedOnboarding == null) {
      return const SplashScreen();
    }

    if (!hasCompletedOnboarding) {
      return OnboardingScreen(onFinished: _completeOnboarding);
    }

    return widget.child;
  }
}
