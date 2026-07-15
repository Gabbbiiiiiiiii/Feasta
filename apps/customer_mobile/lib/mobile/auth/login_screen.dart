import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/constants/firestore_collections.dart';
import '../../core/constants/status_constants.dart';
import '../../repositories/auth_repository.dart';
import '../customer/customer_main_screen.dart';
import '../customer/phone_verification_screen.dart';
import '../provider/provider_dashboard_screen.dart';
import 'email_verification_screen.dart';
import 'forgot_password_screen.dart';
import 'pending_approval_screen.dart';
import 'role_selection_screen.dart';

class LoginScreen extends StatefulWidget {
  final bool canSkip;
  final Widget? redirectAfterLogin;

  const LoginScreen({
    super.key,
    this.canSkip = true,
    this.redirectAfterLogin,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final AuthRepository _authRepository = AuthRepository();
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();

  bool isLoading = false;
  bool obscurePassword = true;

  String? emailError;
  String? passwordError;
  String? generalError;
  String? successMessage;

  void _clearMessages() {
    setState(() {
      emailError = null;
      passwordError = null;
      generalError = null;
      successMessage = null;
    });
  }

  void _setGeneralError(String message) {
    setState(() {
      generalError = _friendlyErrorMessage(message);
      successMessage = null;
    });
  }

  Future<void> _routeAfterSignIn({
    required String uid,
    required Map<String, dynamic> data,
  }) async {
    final role = data['role'];
    final isActive = data['isActive'] ?? true;
    final isBlocked = data['isBlocked'] ?? false;

    if (!isActive || isBlocked) {
      await _authRepository.logout();
      throw Exception('Your account is inactive or blocked.');
    }

    if (role == UserRoles.customer) {
      final isPhoneVerified = data['isPhoneVerified'] ?? false;

      if (!mounted) return;

      if (!isPhoneVerified) {
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(
            builder: (_) => const PhoneVerificationScreen(),
          ),
          (_) => false,
        );
        return;
      }

      final destination =
          widget.redirectAfterLogin ?? const CustomerMainScreen();

      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => destination),
        (_) => false,
      );
      return;
    }

    if (role == UserRoles.provider) {
      final verificationStatus =
          await _authRepository.providerVerificationStatusForOwner(uid);

      if (!mounted) return;

      if (verificationStatus != ProviderVerificationStatus.verified) {
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(builder: (_) => const PendingApprovalScreen()),
          (_) => false,
        );
        return;
      }

      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const ProviderDashboardScreen()),
        (_) => false,
      );
      return;
    }

    throw Exception('Invalid user role.');
  }

  Future<void> _login() async {
    FocusScope.of(context).unfocus();
    _clearMessages();

    final email = emailController.text.trim();
    final password = passwordController.text.trim();

    bool hasError = false;

    if (email.isEmpty) {
      emailError = 'Email is required.';
      hasError = true;
    } else if (!_isValidEmail(email)) {
      emailError = 'Enter a valid email';
      hasError = true;
    }

    if (password.isEmpty) {
      passwordError = 'Password is required.';
      hasError = true;
    }

    if (hasError) {
      setState(() {});
      return;
    }

    setState(() => isLoading = true);

    try {
      await _authRepository.login(
        email: email,
        password: password,
      );

      final user = _authRepository.currentUser;

      if (user == null) {
        throw Exception('Login failed.');
      }

      await user.reload();

      final refreshedUser = _authRepository.currentUser;

      if (refreshedUser == null) {
        throw Exception('Login failed.');
      }

      if (!refreshedUser.emailVerified) {
        if (!mounted) return;

        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(
            builder: (_) => EmailVerificationScreen(email: email),
          ),
          (_) => false,
        );
        return;
      }

      final userDoc = await _db
          .collection(FirestoreCollections.users)
          .doc(refreshedUser.uid)
          .get();

      if (!userDoc.exists) {
        await _authRepository.logout();
        throw Exception('User data not found in Firestore.');
      }

      await _db
          .collection(FirestoreCollections.users)
          .doc(refreshedUser.uid)
          .update({
        'isEmailVerified': true,
        'lastLoginAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      final data = userDoc.data()!;
      await _routeAfterSignIn(uid: refreshedUser.uid, data: data);
    } catch (e) {
      if (!mounted) return;

      final message = e.toString().toLowerCase();

      if (message.contains('wrong-password') ||
          message.contains('invalid-credential') ||
          message.contains('user-not-found')) {
        setState(() {
          emailError = ' ';
          passwordError = 'Wrong email or password.';
          generalError = null;
          successMessage = null;
        });
      } else if (message.contains('verify your email')) {
        setState(() {
          emailError = ' ';
          passwordError = 'Please verify your email before logging in.';
          generalError = null;
          successMessage = null;
        });
      } else {
        _setGeneralError(e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  void _continueAsGuest() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const CustomerMainScreen()),
    );
  }

  String _friendlyErrorMessage(String message) {
    final lowerMessage = message.toLowerCase();

    if (lowerMessage.contains('verify your email')) {
      return 'Please verify your email before logging in. Check your inbox for the verification link.';
    }

    if (lowerMessage.contains('missing-email')) {
      return 'Enter your email first.';
    }

    if (lowerMessage.contains('invalid-email') ||
        lowerMessage.contains('badly formatted')) {
      return 'Please enter a valid email.';
    }

    if (lowerMessage.contains('user-not-found')) {
      return 'No account was found with this email.';
    }

    if (lowerMessage.contains('wrong-password') ||
        lowerMessage.contains('invalid-credential')) {
      return 'Wrong email or password.';
    }

    if (lowerMessage.contains('email-already-in-use')) {
      return 'This email is already registered. Try logging in instead.';
    }

    if (lowerMessage.contains('weak-password')) {
      return 'Your password is too weak. Please use a stronger password.';
    }

    if (lowerMessage.contains('network-request-failed')) {
      return 'Please check your internet connection and try again.';
    }

    if (lowerMessage.contains('too-many-requests')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }

    if (lowerMessage.contains('google sign-in was cancelled') ||
        lowerMessage.contains('canceled')) {
      return 'Google sign-in was cancelled.';
    }

    if (lowerMessage.contains('account is inactive') ||
        lowerMessage.contains('blocked')) {
      return 'Your account is currently unavailable. Please contact support.';
    }

    return message
        .replaceAll('Exception: ', '')
        .replaceAll(RegExp(r'\[firebase_auth\/[^\]]+\]\s*'), '');
  }

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);
    const background = Color(0xFFF8F6F3);
    const textDark = Color(0xFF2B211D);
    const textSoft = Color(0xFF8C817A);

    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(22, 10, 22, 30),
                color: primary,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      height: 44,
                      child: widget.canSkip
                          ? IconButton(
                              onPressed: _continueAsGuest,
                              icon: const Icon(
                                Icons.close_rounded,
                                color: Colors.white,
                                size: 32,
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Container(
                          width: 58,
                          height: 58,
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Image.asset(
                            'assets/images/mobile_logo.png',
                            fit: BoxFit.contain,
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Text(
                          'Feasta',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 34,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),
                    const Text(
                      'Book trusted caterers and event services.',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        height: 1.18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                color: primary,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(28, 28, 28, 28),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(30),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                        const Text(
                          'Log in',
                          style: TextStyle(
                            color: textDark,
                            fontSize: 26,
                            fontWeight: FontWeight.w900,
                          ),
                        ),

                        const SizedBox(height: 6),

                        const Text(
                          'Welcome back. Please enter your account details.',
                          style: TextStyle(
                            color: textSoft,
                            fontSize: 14,
                            height: 1.4,
                            fontWeight: FontWeight.w600,
                          ),
                        ),

                        const SizedBox(height: 22),

                        TextField(
                          controller: emailController,
                          keyboardType: TextInputType.emailAddress,
                          decoration: InputDecoration(
                            hintText: 'Email',
                            errorText: emailError,
                            errorMaxLines: 2,
                            filled: true,
                            fillColor: Colors.white,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 18,
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: Color(0xFFE3DAD4),
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: primary,
                                width: 1.6,
                              ),
                            ),
                            errorBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: primary,
                                width: 1.4,
                              ),
                            ),
                            focusedErrorBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: primary,
                                width: 1.6,
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 12),

                        TextField(
                          controller: passwordController,
                          obscureText: obscurePassword,
                          decoration: InputDecoration(
                            hintText: 'Password',
                            errorText: passwordError,
                            errorMaxLines: 2,
                            filled: true,
                            fillColor: Colors.white,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 18,
                            ),
                            suffixIcon: IconButton(
                              onPressed: () {
                                setState(() {
                                  obscurePassword = !obscurePassword;
                                });
                              },
                              icon: Icon(
                                obscurePassword
                                    ? Icons.visibility_off
                                    : Icons.visibility,
                                color: textSoft,
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: Color(0xFFE3DAD4),
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: primary,
                                width: 1.6,
                              ),
                            ),
                            errorBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: primary,
                                width: 1.4,
                              ),
                            ),
                            focusedErrorBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: primary,
                                width: 1.6,
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 10),

                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: isLoading
                                ? null
                                : () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) =>
                                            const ForgotPasswordScreen(),
                                      ),
                                    );
                                  },
                            child: const Text(
                              'Forgot password?',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 22),

                        SizedBox(
                          width: double.infinity,
                          height: 56,
                          child: ElevatedButton(
                            onPressed: isLoading ? null : _login,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: primary,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                            child: isLoading
                                ? const SizedBox(
                                    width: 24,
                                    height: 24,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 2.6,
                                    ),
                                  )
                                : const Text(
                                    'Log in',
                                    style: TextStyle(
                                      fontSize: 17,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                          ),
                        ),

                        if (generalError != null) ...[
                          const SizedBox(height: 16),
                          _AuthMessageBox(
                            message: generalError!,
                            isError: true,
                          ),
                        ],

                        if (successMessage != null) ...[
                          const SizedBox(height: 16),
                          _AuthMessageBox(
                            message: successMessage!,
                            isError: false,
                          ),
                        ],

                        const SizedBox(height: 18),

                        const Row(
                          children: [
                            Expanded(child: Divider()),
                            Padding(
                              padding: EdgeInsets.symmetric(horizontal: 12),
                              child: Text(
                                'or',
                                style: TextStyle(
                                  color: Colors.grey,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            Expanded(child: Divider()),
                          ],
                        ),

                        const SizedBox(height: 18),

                        SizedBox(
                          width: double.infinity,
                          height: 56,
                          child: OutlinedButton.icon(
                            onPressed: isLoading ? null : _loginWithGoogle,
                            icon: Image.asset(
                              'assets/images/google_logo.png',
                              width: 22,
                              height: 22,
                              fit: BoxFit.contain,
                            ),
                            label: const Text(
                              'Continue with Google',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: textDark,
                              backgroundColor: Colors.white,
                              side: const BorderSide(
                                color: Color(0xFFE3DAD4),
                                width: 1.4,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 28),

                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text(
                              "Don't have an account? ",
                              style: TextStyle(
                                color: textSoft,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            GestureDetector(
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        const RoleSelectionScreen(),
                                  ),
                                );
                              },
                              child: const Text(
                                'Create Account',
                                style: TextStyle(
                                  color: primary,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _loginWithGoogle() async {
    setState(() => isLoading = true);

    try {
      await _authRepository.signInWithGoogleAsCustomer();

      final user = _authRepository.currentUser;

      if (user == null) {
        throw Exception('Google sign-in failed.');
      }

      final userDoc = await _db
          .collection(FirestoreCollections.users)
          .doc(user.uid)
          .get();

      if (!userDoc.exists) {
        throw Exception('User data not found in Firestore.');
      }

      final data = userDoc.data()!;
      final role = data['role'];

      if (role != UserRoles.customer) {
        await _authRepository.logout();
        throw Exception(
          'Google sign-in is only available for customer accounts.',
        );
      }

      await _routeAfterSignIn(uid: user.uid, data: data);
    } on GoogleSignInException catch (e) {
      if (!mounted) return;

      if (e.code == GoogleSignInExceptionCode.canceled) {
        _setGeneralError('Google sign-in was cancelled.');
      } else {
        _setGeneralError('Google sign-in failed. Please try again.');
      }
    } catch (e) {
      if (!mounted) return;

      _setGeneralError(e.toString());
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  bool _isValidEmail(String email) {
    return RegExp(r'^[\w\.-]+@([\w-]+\.)+[\w-]{2,}$').hasMatch(email);
  }
}
class _AuthMessageBox extends StatelessWidget {
  final String message;
  final bool isError;

  const _AuthMessageBox({
    required this.message,
    required this.isError,
  });

  @override
  Widget build(BuildContext context) {
    final color = isError
        ? const Color(0xFFFF6333)
        : const Color(0xFF16A34A);

    final background = isError
        ? const Color(0xFFFFF1EB)
        : const Color(0xFFEFFAF3);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: color,
          fontSize: 14,
          height: 1.35,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
