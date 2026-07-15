import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/constants/firestore_collections.dart';
import '../../core/constants/status_constants.dart';
import '../../core/utils/startup_guard.dart';
import '../authentication/data/repositories/auth_repository.dart';
import '../presentation/screens/email_verification_screen.dart';
import '../presentation/screens/login_screen.dart';
import '../presentation/screens/pending_approval_screen.dart';
import '../customer/customer_main_screen.dart';
import '../customer/phone_verification_screen.dart';
import '../onboarding/onboarding_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final AuthRepository _authRepository = AuthRepository();

  @override
  void initState() {
    super.initState();
    _checkUser();
  }

  Future<void> _checkUser() async {
    try {
      await runStartupStep<void>(
        stepName: 'splash initial delay',
        operation: Future.delayed(const Duration(seconds: 2)),
        timeout: const Duration(seconds: 5),
        fallbackValue: null,
      );

      final user = _auth.currentUser;

      if (!mounted) return;

      if (user == null) {
        final prefs = await runStartupStep<SharedPreferences?>(
          stepName: 'shared preferences initialization',
          operation: SharedPreferences.getInstance(),
          timeout: const Duration(seconds: 5),
          fallbackValue: null,
        );
        final hasSeenOnboarding =
            prefs?.getBool(OnboardingScreen.seenOnboardingKey) ?? false;

        if (!mounted) return;

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => hasSeenOnboarding
                ? const LoginScreen()
                : const OnboardingScreen(),
          ),
        );
        return;
      }

      await runStartupStep<void>(
        stepName: 'auth reload',
        operation: user.reload(),
        timeout: const Duration(seconds: 5),
        fallbackValue: null,
      );

      if (!mounted) return;

      final refreshedUser = _auth.currentUser;

      if (refreshedUser == null) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
        return;
      }

      if (!refreshedUser.emailVerified) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => EmailVerificationScreen(
              email: refreshedUser.email ?? '',
            ),
          ),
        );
        return;
      }

      final userDoc = await runStartupStep<
          DocumentSnapshot<Map<String, dynamic>>?>(
        stepName: 'user profile lookup',
        operation: _db
            .collection(FirestoreCollections.users)
            .doc(refreshedUser.uid)
            .get(),
        timeout: const Duration(seconds: 8),
        fallbackValue: null,
      );

      if (!mounted) return;

      if (userDoc == null || !userDoc.exists) {
        await _auth.signOut();

        if (!mounted) return;

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
        return;
      }

      final data = userDoc.data() ?? {};
      final role = data['role'];
      final isActive = data['isActive'] ?? true;
      final isBlocked = data['isBlocked'] ?? false;

      if (!isActive || isBlocked) {
        await _auth.signOut();

        if (!mounted) return;

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
        return;
      }

      if (role == UserRoles.customer) {
        final isPhoneVerified = data['isPhoneVerified'] ?? false;

        if (!isPhoneVerified) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => const PhoneVerificationScreen()),
          );
          return;
        }

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const CustomerMainScreen()),
        );
      } else if (role == UserRoles.provider) {
        final verificationStatus = await runStartupStep<String?>(
          stepName: 'provider verification lookup',
          operation: _authRepository.providerVerificationStatusForOwner(
            refreshedUser.uid,
          ),
          timeout: const Duration(seconds: 8),
          fallbackValue: null,
        );

        if (!mounted) return;

        if (verificationStatus != ProviderVerificationStatus.verified) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => const PendingApprovalScreen()),
          );
          return;
        }

        
      } else {
        await _auth.signOut();

        if (!mounted) return;

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
      }
    } catch (error, stackTrace) {
      debugPrint('Startup flow failed: $error');
      debugPrint(stackTrace.toString());
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFF6333),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(28),
                  child: Image.asset(
                    'assets/images/mobile_logo.png',
                    width: 130,
                    height: 130,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(height: 28),
                const Text(
                  'Feasta',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 42,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Find, customize, and book trusted catering services for your events.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 60),
                const CircularProgressIndicator(
                  color: Colors.white,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
