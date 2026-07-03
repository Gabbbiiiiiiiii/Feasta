import 'package:flutter/material.dart';

import '../../repositories/auth_repository.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final AuthRepository _authRepository = AuthRepository();
  final TextEditingController emailController = TextEditingController();

  bool isLoading = false;
  String? emailError;
  String? successMessage;

  bool get canSendResetLink {
    return emailController.text.trim().isNotEmpty && !isLoading;
  }

  @override
  void initState() {
    super.initState();

    emailController.addListener(() {
      setState(() {
        if (emailController.text.trim().isNotEmpty) {
          emailError = null;
          successMessage = null;
        }
      });
    });
  }

  Future<void> _sendResetLink() async {
    final email = emailController.text.trim();

    setState(() {
      emailError = null;
      successMessage = null;
    });

    if (email.isEmpty) {
      setState(() {
        emailError = 'Email is required.';
      });
      return;
    }

    if (!_isValidEmail(email)) {
      setState(() {
        emailError = 'Enter a valid email.';
      });
      return;
    }

    setState(() => isLoading = true);

    try {
      await _authRepository.sendPasswordResetEmail(email: email);

      if (!mounted) return;

      setState(() {
        successMessage =
            'If this email is registered, a password reset link will be sent shortly.';
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        emailError = _friendlyErrorMessage(e.toString());
      });
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  bool _isValidEmail(String email) {
    return RegExp(r'^[\w\.-]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(email);
  }

  String _friendlyErrorMessage(String message) {
    final lowerMessage = message.toLowerCase();

    if (lowerMessage.contains('missing-email')) {
      return 'Email is required.';
    }

    if (lowerMessage.contains('invalid-email') ||
        lowerMessage.contains('badly formatted')) {
      return 'Enter a valid email.';
    }

    if (lowerMessage.contains('user-not-found')) {
      return 'No account was found with this email.';
    }

    if (lowerMessage.contains('network-request-failed')) {
      return 'Please check your internet connection and try again.';
    }

    if (lowerMessage.contains('too-many-requests')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }

    return message
        .replaceAll('Exception: ', '')
        .replaceAll(RegExp(r'\[firebase_auth\/[^\]]+\]\s*'), '');
  }

  @override
  void dispose() {
    emailController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);
    const textDark = Color(0xFF2B211D);
    const textSoft = Color(0xFF8C817A);
    const fieldBorder = Color(0xFFE3DAD4);

    final hasEmailError = emailError != null;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.arrow_back_rounded),
                padding: EdgeInsets.zero,
                alignment: Alignment.centerLeft,
              ),

              const SizedBox(height: 40),

              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF1EB),
                  borderRadius: BorderRadius.circular(24),
                ),
                // child: const Icon(
                //   Icons.lock_reset_rounded,
                //   color: primary,
                //   size: 42,
                // ),
              ),

              const SizedBox(height: 18),

              const Text(
                'Can’t access your account?',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                  color: textDark,
                ),
              ),

              const SizedBox(height: 10),

              const Text(
                'Enter the email linked to your Feasta account. If it is registered, we’ll send a password reset link.',
                style: TextStyle(
                  color: Colors.grey,
                  fontSize: 16,
                  height: 1.45,
                  fontWeight: FontWeight.w600,
                ),
              ),

            //   const SizedBox(height: 36),

            //   const Text(
            //     'Email',
            //     style: TextStyle(
            //       fontWeight: FontWeight.w800,
            //       color: textDark,
            //     ),
            //   ),

              const SizedBox(height: 8),

              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                style: const TextStyle(
                  color: textDark,
                  fontSize: 16,
                  fontWeight: FontWeight.w400,
                ),
                decoration: InputDecoration(
                  hintText: 'Email',
                  errorText: emailError,
                  errorMaxLines: 2,
                //   prefixIcon: Icon(
                //     Icons.email_outlined,
                //     color: hasEmailError ? Colors.red : textSoft,
                //   ),
                  filled: true,
                  fillColor: const Color(0xFFF8F6F3),
                  hintStyle: const TextStyle(
                    color: Color(0xFFB2AAA4),
                    fontWeight: FontWeight.w600,
                  ),
                  errorStyle: const TextStyle(
                    color: Colors.red,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(
                      color: hasEmailError ? Colors.red : fieldBorder,
                      width: 1.3,
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(
                      color: hasEmailError ? Colors.red : primary,
                      width: 1.6,
                    ),
                  ),
                  errorBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(
                      color: Colors.red,
                      width: 1.4,
                    ),
                  ),
                  focusedErrorBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(
                      color: Colors.red,
                      width: 1.6,
                    ),
                  ),
                ),
              ),

              if (successMessage != null) ...[
                const SizedBox(height: 18),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF1EB),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: primary,
                      width: 1.2,
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.mark_email_read_outlined,
                        color: primary,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          successMessage!,
                          style: const TextStyle(
                            color: textDark,
                            fontSize: 14,
                            height: 1.35,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 30),

              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: canSendResetLink ? _sendResetLink : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: primary.withValues(alpha: 0.42),
                    disabledForegroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
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
                          'Send Reset Link',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}