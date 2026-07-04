import 'package:flutter/material.dart';
import 'package:feasta/web/admin/widgets/common/fade_in.dart';

import '../../services/admin_auth_service.dart';
import 'login_textfield.dart';
import 'login_button.dart';

class LoginRightPanel extends StatefulWidget {
  const LoginRightPanel({super.key});

  @override
  State<LoginRightPanel> createState() => _LoginRightPanelState();
}

class _LoginRightPanelState extends State<LoginRightPanel> {
  final _formKey = GlobalKey<FormState>();

  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();

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
      await _authService.loginAdmin(
        email: emailController.text.trim(),
        password: passwordController.text.trim(),
      );

      // success → navigation handled by AuthGate later
    } catch (e) {
      setState(() {
        errorMessage = e.toString().replaceAll("Exception: ", "");
      });
    }

    setState(() {
      isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return FadeIn(
      child: Center(
        child: Container(
          width: 420,
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.08),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  "Admin Login",
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 6),

                const Text(
                  "Sign in to access dashboard",
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey,
                  ),
                ),

                const SizedBox(height: 20),

                if (errorMessage != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(
                      errorMessage!,
                      style: const TextStyle(
                        color: Colors.red,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],

                LoginTextField(
                  controller: emailController,
                  hintText: "Email",
                  icon: Icons.email,
                  keyboardType: TextInputType.emailAddress,
                  validator: (value) =>
                      value == null || value.isEmpty ? "Email is required" : null,
                ),

                const SizedBox(height: 12),

                LoginTextField(
                  controller: passwordController,
                  hintText: "Password",
                  icon: Icons.lock,
                  isPassword: true,
                  validator: (value) =>
                      value == null || value.isEmpty ? "Password is required" : null,
                ),

                const SizedBox(height: 20),

                LoginButton(
                  text: isLoading ? "Logging in..." : "Login",
                  isLoading: isLoading,
                  onPressed: _login,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}