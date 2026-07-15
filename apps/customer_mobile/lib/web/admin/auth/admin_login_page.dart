import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:feasta/web/admin/widgets/common/fade_in.dart';
import 'package:flutter/services.dart';

import 'admin_forgot_password_page.dart';
import '../services/admin_auth_service.dart';

class AdminLoginPage extends StatelessWidget {
  const AdminLoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    final isDesktop = width >= 900;

    return Scaffold(
        backgroundColor: const Color(0xFFF5F6F8),
        body: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => FocusScope.of(context).unfocus(),
          child: FadeIn(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 400),
              child: isDesktop
                  ? const Center(
                      child: LoginRightPanel(),
                    )
                  : Center(
                  child: SingleChildScrollView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.all(20),
                    child: LoginRightPanel(),
                  ),
              ),
            ),
          ),
        ),
      );
  }
}

class LoginRightPanel extends StatefulWidget {
  const LoginRightPanel({super.key});

  @override
  State<LoginRightPanel> createState() => _LoginRightPanelState();
}

class _LoginRightPanelState extends State<LoginRightPanel> {
  final _formKey = GlobalKey<FormState>();

  final emailController = TextEditingController();
  final passwordController = TextEditingController();

  final AdminAuthService _authService = AdminAuthService();

  bool isLoading = false;
  String? errorMessage;

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      isLoading = true;
      errorMessage = null;
    });

    try {
      final email = emailController.text.trim();
      final password = passwordController.text;

      await _authService.loginAdmin(
        email: email,
        password: password,
      );

      final currentUser = FirebaseAuth.instance.currentUser;
      debugPrint('AdminLoginPage._login: currentUser=${currentUser?.uid} email=${currentUser?.email}');
      if (currentUser != null) {
        await currentUser.reload();
      }

      TextInput.finishAutofillContext();

    } catch (e) {
      if (!mounted) return;

      setState(() {
        errorMessage = e.toString().replaceAll("Exception: ", "");
      });
    }

    if (mounted) {
      setState(() {
        isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeIn(
      child: Center(
        child: Container(
          constraints: const BoxConstraints(
            maxWidth: 460,
          ),
          width: double.infinity,
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha((0.08 * 255).round()),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: AutofillGroup(
            child: Form(
              key: _formKey,
              autovalidateMode: AutovalidateMode.onUserInteraction,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Column(
                    children: [
                      Text(
                        "Administrator Login",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        "Sign in with your authorized administrator account.",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 24),

                  if (errorMessage != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        border: Border.all(color: Colors.red.shade200),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        errorMessage!,
                        style: const TextStyle(
                          color: Colors.red,
                          fontSize: 13,
                        ),
                      ),
                    ),

                  const Text(
                    "Email Address",
                    style: TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 6),

                  LoginTextField(
                    controller: emailController,
                    hintText: "Enter admin email",
                    icon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [
                      AutofillHints.username,
                      AutofillHints.email,
                    ],
                    onChanged: (_) {
                      if (errorMessage != null) {
                        setState(() {
                          errorMessage = null;
                        });
                      }
                    },
                    validator: (value) {
                      if(value == null || value.trim().isEmpty) {
                        return "Administrator email is required";
                      }

                      final email = value.trim();

                      if (email.length > 254) {
                        return "Email address is too long.";
                      }

                      final emailRegex = RegExp(r'^[^@]+@[^@]+\.[^@]+$');

                      if (!emailRegex.hasMatch(email)) {
                        return "Please enter a valid email address";
                      }

                      return null;
                    }
                  ),

                  const SizedBox(height: 16),

                  const Text(
                    "Password",
                    style: TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 6),

                  LoginTextField(
                  controller: passwordController,
                  hintText: "Enter your password",
                  icon: Icons.lock_outline,
                  isPassword: true,
                  autofillHints: const [
                    AutofillHints.password,
                  ],
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) {
                    FocusScope.of(context).unfocus();

                    if (!isLoading) {
                      _login();
                    }
                  },
                  onChanged: (_) {
                    if (errorMessage != null) {
                      setState(() {
                        errorMessage = null;
                      });
                    }
                  },
                    validator: (value) {
                      if(value == null || value.isEmpty) {
                        return "Password is required";
                      }

                      if (value.length > 128) {
                        return "Password is too long.";
                      }

                      if(value.length < 8) {
                        return "Password must be at least 8 characters long";
                      }

                      return null;
                    }
                  ),

                  const SizedBox(height: 12),

                  Row(
                    children: [
                      const Spacer(),
                      TextButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const AdminForgotPasswordPage(),
                            ),
                          );
                        },
                        child: const Text("Forgot password?"),
                      )
                    ],
                  ),

                  const SizedBox(height: 10),

                  LoginButton(
                    text: isLoading ? "Signing In..." : "Sign In",
                    isLoading: isLoading,
                    onPressed: () {
                      FocusScope.of(context).unfocus();
                      _login();
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class LoginTextField extends StatefulWidget {
  final TextEditingController controller;
  final String hintText;
  final IconData icon;
  final bool isPassword;
  final TextInputType keyboardType;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onFieldSubmitted;
  final Iterable<String>? autofillHints;

  const LoginTextField({
    super.key,
    required this.controller,
    required this.hintText,
    required this.icon,
    this.isPassword = false,
    this.keyboardType = TextInputType.text,
    this.validator,
    this.onChanged,
    this.textInputAction,
    this.onFieldSubmitted,
    this.autofillHints,
  });

  @override
  State<LoginTextField> createState() => _LoginTextFieldState();
}

class _LoginTextFieldState extends State<LoginTextField> {
  bool _obscureText = true;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      keyboardType: widget.keyboardType,
      obscureText: widget.isPassword ? _obscureText : false,
      validator: widget.validator,
      onChanged: widget.onChanged,
      textInputAction: widget.textInputAction,
      onFieldSubmitted: widget.onFieldSubmitted,
      autofillHints: widget.autofillHints,
      style: const TextStyle(fontSize: 14),
      decoration: InputDecoration(
        hintText: widget.hintText,
        prefixIcon: Icon(widget.icon, size: 20),
        filled: true,
        fillColor: Colors.grey.shade100,
        contentPadding: const EdgeInsets.symmetric(
          vertical: 14,
          horizontal: 12,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(
            color: Colors.deepOrange,
          ),
        ),
        suffixIcon: widget.isPassword
            ? IconButton(
                icon: Icon(
                  _obscureText
                      ? Icons.visibility_off
                      : Icons.visibility,
                  size: 20,
                ),
                onPressed: () {
                  setState(() {
                    _obscureText = !_obscureText;
                  });
                },
              )
            : null,
      ),
    );
  }
}

class LoginButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final Color color;

  const LoginButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.isLoading = false,
    this.color = Colors.deepOrange,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          disabledBackgroundColor: color.withAlpha((0.5 * 255).round()),
          elevation: 2,
          shadowColor: color.withAlpha((0.25 * 255).round()),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
        ),
        child: isLoading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(
                text,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
      ),
    );
  }
}