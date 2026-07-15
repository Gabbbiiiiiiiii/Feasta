import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:feasta/web/admin/auth/admin_login_page.dart';
import '../layout/admin_shell.dart';
import '../services/admin_auth_service.dart';

class AdminAuthGate extends StatelessWidget {
  const AdminAuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final user = snapshot.data;

        // 🚫 NOT LOGGED IN
        if (user == null) {
          return const AdminLoginPage();
        }

        // 🔄 CHECK ADMIN ROLE
        return FutureBuilder<bool>(
          future: AdminAuthService().isAdmin(),
          builder: (context, adminSnap) {
            if (adminSnap.connectionState == ConnectionState.waiting) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }

            if (adminSnap.hasError) {
              final errorMessage = adminSnap.error.toString();
              debugPrint('AdminAuthGate error: $errorMessage');
              return Scaffold(
                body: Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      'Authentication failed: $errorMessage',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 18,
                        color: Colors.red,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              );
            }

            final isAdmin = adminSnap.data ?? false;

            // 🚫 NOT ADMIN
            if (!isAdmin) {
              return const Scaffold(
                body: Center(
                  child: Text(
                    "Access Denied\nAdmin only.",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 18,
                      color: Colors.red,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              );
            }

            // ✅ ADMIN ACCESS
            return const AdminShell();
          },
        );
      },
    );
  }
}