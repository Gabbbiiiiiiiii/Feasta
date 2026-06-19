import 'package:flutter/material.dart';

import '../../repositories/auth_repository.dart';
import 'email_verification_screen.dart';
import 'login_screen.dart';

class CustomerRegisterScreen extends StatefulWidget {
  const CustomerRegisterScreen({super.key});

  @override
  State<CustomerRegisterScreen> createState() => _CustomerRegisterScreenState();
}

class _CustomerRegisterScreenState extends State<CustomerRegisterScreen> {
  final AuthRepository _authRepository = AuthRepository();
  final PageController _pageController = PageController();

  final firstNameController = TextEditingController();
  final lastNameController = TextEditingController();
  final emailController = TextEditingController();
  final passwordController = TextEditingController();

  int currentPage = 0;
  bool isLoading = false;
  bool obscurePassword = true;
  

  String? firstNameError;
  String? lastNameError;
  String? emailError;
  String? passwordError;
  String? generalError;

  static const Color primary = Color(0xFFFF6333);
  static const Color background = Color(0xFFF8F6F3);
  static const Color textDark = Color(0xFF2B211D);
  static const Color textSoft = Color(0xFF8C817A);

  void _clearErrors() {
    setState(() {
      firstNameError = null;
      lastNameError = null;
      emailError = null;
      passwordError = null;
      generalError = null;
    });
  }

  Future<void> _nextPage() async {
    FocusScope.of(context).unfocus();
    _clearErrors();

    bool hasError = false;

    if (currentPage == 0) {
      if (firstNameController.text.trim().isEmpty) {
        firstNameError = 'First name is required.';
        hasError = true;
      }

      if (lastNameController.text.trim().isEmpty) {
        lastNameError = 'Last name is required.';
        hasError = true;
      }
    }

    if (currentPage == 1) {
      final email = emailController.text.trim();

      if (email.isEmpty) {
        emailError = 'Email is required.';
        hasError = true;
      } else if (!_isValidEmail(email)) {
        emailError = 'Enter a valid email address.';
        hasError = true;
      }
    }

    if (hasError) {
      setState(() {});
      return;
    }

    if (currentPage < 2) {
      await _pageController.nextPage(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _previousPage() async {
    FocusScope.of(context).unfocus();

    if (currentPage > 0) {
      await _pageController.previousPage(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    } else {
      Navigator.pop(context);
    }
  }

  Future<void> _register() async {
    FocusScope.of(context).unfocus();
    _clearErrors();

    final firstName = firstNameController.text.trim();
    final lastName = lastNameController.text.trim();
    final email = emailController.text.trim();
    final password = passwordController.text.trim();


    bool hasError = false;

    if (firstName.isEmpty) {
      firstNameError = 'First name is required.';
      hasError = true;
    }

    if (lastName.isEmpty) {
      lastNameError = 'Last name is required.';
      hasError = true;
    }

    if (email.isEmpty) {
      emailError = 'Email is required.';
      hasError = true;
    } else if (!_isValidEmail(email)) {
      emailError = 'Enter a valid email address.';
      hasError = true;
    }

    if (password.isEmpty) {
      passwordError = 'Password is required.';
      hasError = true;
    } else if (password.length < 6) {
      passwordError = 'Password must be at least 6 characters.';
      hasError = true;
    }

    if (hasError) {
      setState(() {});

      if (firstNameError != null || lastNameError != null) {
        _pageController.jumpToPage(0);
      } else if (emailError != null) {
        _pageController.jumpToPage(1);
      } else {
        _pageController.jumpToPage(2);
      }

      return;
    }

    setState(() => isLoading = true);

    try {
      await _authRepository.registerCustomer(
        firstName: firstName,
        lastName: lastName,
        email: email,
        phoneNumber: '',
        password: password,
      );

      if (!mounted) return;

      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => EmailVerificationScreen(
            email: email,
          ),
        ),
        (_) => false,
      );
    } catch (e) {
      if (!mounted) return;

      setState(() {
        generalError = _friendlyErrorMessage(e.toString());
      });
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  bool _isValidEmail(String email) {
    return RegExp(r'^[\w\.-]+@([\w-]+\.)+[\w-]{2,}$').hasMatch(email);
  }

  String _friendlyErrorMessage(String message) {
    final lowerMessage = message.toLowerCase();

    if (lowerMessage.contains('email-already-in-use')) {
      return 'This email is already registered. Try logging in instead.';
    }

    if (lowerMessage.contains('invalid-email') ||
        lowerMessage.contains('badly formatted')) {
      return 'Please enter a valid email address.';
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

    return message
        .replaceAll('Exception: ', '')
        .replaceAll(RegExp(r'\[firebase_auth\/[^\]]+\]\s*'), '');
  }

  @override
  void dispose() {
    _pageController.dispose();
    firstNameController.dispose();
    lastNameController.dispose();
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 14, top: 10),
              child: Align(
                alignment: Alignment.centerLeft,
                child: IconButton(
                  onPressed: isLoading ? null : _previousPage,
                  icon: Icon(
                    currentPage == 0
                        ? Icons.close_rounded
                        : Icons.arrow_back_rounded,
                    color: textDark,
                    size: 32,
                  ),
                ),
              ),
            ),

            Expanded(
              child: PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                onPageChanged: (index) {
                  setState(() {
                    currentPage = index;
                  });
                },
                children: [
                  _NamePage(
                    firstNameController: firstNameController,
                    lastNameController: lastNameController,
                    firstNameError: firstNameError,
                    lastNameError: lastNameError,
                    onNext: _nextPage,
                  ),
                  _EmailPage(
                    emailController: emailController,
                    emailError: emailError,
                    onNext: _nextPage,
                  ),
                  _PasswordPage(
                    passwordController: passwordController,
                   
                    passwordError: passwordError,
                    
                    obscurePassword: obscurePassword,
                    
                    onRegister: _register,
                    isLoading: isLoading,
                    onTogglePassword: () {
                      setState(() {
                        obscurePassword = !obscurePassword;
                      });
                    },
        
                  ),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 26),
              child: Column(
                children: [
                  if (generalError != null) ...[
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 14),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF1EB),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: primary,
                        ),
                      ),
                      child: Text(
                        generalError!,
                        style: const TextStyle(
                          color: primary,
                          fontSize: 14,
                          height: 1.35,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],

                  const SizedBox(height: 22),

                  GestureDetector(
                    onTap: isLoading
                        ? null
                        : () {
                            Navigator.pushReplacement(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const LoginScreen(),
                              ),
                            );
                          },
                    child: const Text(
                      'Already have an account?',
                      style: TextStyle(
                        color: primary,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NamePage extends StatelessWidget {
  final TextEditingController firstNameController;
  final TextEditingController lastNameController;
  final String? firstNameError;
  final String? lastNameError;
  final VoidCallback onNext;

  const _NamePage({
    required this.firstNameController,
    required this.lastNameController,
    required this.firstNameError,
    required this.lastNameError,
    required this.onNext,
  });

  @override
  Widget build(BuildContext context) {
    return _RegisterPageLayout(
      title: "What's your name?",
      subtitle: 'Enter your first name and last name.',
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _FeastaInput(
                  controller: firstNameController,
                  label: 'First name',
                  errorText: firstNameError,
                  textInputAction: TextInputAction.next,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: _FeastaInput(
                  controller: lastNameController,
                  label: 'Last name',
                  errorText: lastNameError,
                  textInputAction: TextInputAction.done,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          _FeastaPrimaryButton(
            text: 'Next',
            onPressed: onNext,
          ),
        ],
      ),
    );
  }
}

class _EmailPage extends StatelessWidget {
  final TextEditingController emailController;
  final String? emailError;
  final VoidCallback onNext;

  const _EmailPage({
    required this.emailController,
    required this.emailError,
    required this.onNext,
  });

  @override
  Widget build(BuildContext context) {
    return _RegisterPageLayout(
      title: "What's your email?",
      subtitle:
          'Use a valid email address. This will be used for logging in and account verification.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _FeastaInput(
            controller: emailController,
            label: 'Email address',
            errorText: emailError,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
          ),
          const SizedBox(height: 16),
          const Text(
            'You must verify this email before you can fully use your account.',
            style: TextStyle(
              color: CustomerRegisterScreenStateHelper.textSoft,
              fontSize: 15,
              height: 1.4,
              fontWeight: FontWeight.w400,
            ),
          ),
          const SizedBox(height: 24),
          _FeastaPrimaryButton(
            text: 'Next',
            onPressed: onNext,
          ),
        ],
      ),
    );
  }
}

class _PasswordPage extends StatelessWidget {
  final TextEditingController passwordController;
 
  final String? passwordError;

  final bool obscurePassword;

  final VoidCallback onTogglePassword;

  final VoidCallback onRegister;
  final bool isLoading;

  const _PasswordPage({
    required this.passwordController,
   
    required this.passwordError,
  
    required this.obscurePassword,

    required this.onTogglePassword,

    required this.onRegister,
    required this.isLoading,
  });

  @override
  Widget build(BuildContext context) {
    return _RegisterPageLayout(
      title: 'Create a password',
      subtitle:
          'Create a password with at least 6 characters. You will use this with your email when logging in.',
      child: Column(
        children: [
          _FeastaInput(
            controller: passwordController,
            label: 'Password',
            errorText: passwordError,
            obscureText: obscurePassword,
            textInputAction: TextInputAction.next,
            suffixIcon: IconButton(
              onPressed: onTogglePassword,
              icon: Icon(
                obscurePassword
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                color: CustomerRegisterScreenStateHelper.textSoft,
              ),
            ),
          ),
          
          
          const SizedBox(height: 24),
          _FeastaPrimaryButton(
            text: 'Create Account',
            onPressed: onRegister,
            isLoading: isLoading,
          ),
        ],
      ),
    );
  }
}

class _RegisterPageLayout extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;

  const _RegisterPageLayout({
    required this.title,
    required this.subtitle,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 42, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: CustomerRegisterScreenStateHelper.textDark,
              fontSize: 34,
              height: 1.12,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            subtitle,
            style: const TextStyle(
              color: CustomerRegisterScreenStateHelper.textDark,
              fontSize: 19,
              height: 1.45,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 40),
          child,
        ],
      ),
    );
  }
}

class _FeastaInput extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String? errorText;
  final TextInputType? keyboardType;
  final bool obscureText;
  final TextInputAction? textInputAction;
  final Widget? suffixIcon;

  const _FeastaInput({
    required this.controller,
    required this.label,
    this.errorText,
    this.keyboardType,
    this.obscureText = false,
    this.textInputAction,
    this.suffixIcon,
  });

  @override
  Widget build(BuildContext context) {
    final hasError = errorText != null;

    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      textInputAction: textInputAction,
      style: const TextStyle(
        color: CustomerRegisterScreenStateHelper.textDark,
        fontSize: 19,
        fontWeight: FontWeight.w400,
      ),
      decoration: InputDecoration(
        labelText: label,
        errorText: errorText,
        errorMaxLines: 2,
        labelStyle: TextStyle(
          color: hasError
              ? Colors.red
              : CustomerRegisterScreenStateHelper.textSoft,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
        floatingLabelStyle: TextStyle(
          color: hasError
              ? Colors.red
              : CustomerRegisterScreenStateHelper.primary,
          fontSize: 16,
          fontWeight: FontWeight.w800,
        ),
        errorStyle: const TextStyle(
          color: Colors.red,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 20,
          vertical: 20,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: BorderSide(
            color: hasError
                ? Colors.red
                : CustomerRegisterScreenStateHelper.fieldBorder,
            width: 1.4,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: BorderSide(
            color: hasError
                ? Colors.red
                : CustomerRegisterScreenStateHelper.primary,
            width: 1.8,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: const BorderSide(
            color: Colors.red,
            width: 1.5,
          ),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: const BorderSide(
            color: Colors.red,
            width: 1.8,
          ),
        ),
      ),
    );
  }
}

class _FeastaPrimaryButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;

  const _FeastaPrimaryButton({
    required this.text,
    required this.onPressed,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 58,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: CustomerRegisterScreenStateHelper.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor:
              CustomerRegisterScreenStateHelper.primary.withValues(alpha: 0.45),
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
            : Text(
                text,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
      ),
    );
  }
}

class CustomerRegisterScreenStateHelper {
  static const Color primary = Color(0xFFFF6333);
  static const Color textDark = Color(0xFF2B211D);
  static const Color textSoft = Color(0xFF8C817A);
  static const Color fieldBorder = Color(0xFFE3DAD4);
}