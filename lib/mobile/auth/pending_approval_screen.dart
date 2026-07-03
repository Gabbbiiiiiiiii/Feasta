import 'package:flutter/material.dart';
import '../../services/auth_service.dart';
import 'login_screen.dart';

class PendingApprovalScreen extends StatelessWidget {
  const PendingApprovalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authService = AuthService();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Account Pending'),
        backgroundColor: Colors.orange,
      ),
      body: Center(
        child: SizedBox(
          width: 420,
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.pending_actions, size: 70, color: Colors.orange),
                  const SizedBox(height: 16),
                  const Text(
                    'Your provider account is pending approval.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Feasta admin will verify your submitted document before you can offer services.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () async {
                      await authService.logoutUser();
                      if (context.mounted) {
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(builder: (_) => const LoginScreen()),
                        );
                      }
                    },
                    child: const Text('Logout'),
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