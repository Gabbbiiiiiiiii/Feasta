import 'package:flutter/material.dart';

import '../../repositories/auth_repository.dart';
import '../auth/login_screen.dart';

class AdminDashboardScreen extends StatelessWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AuthRepository authRepository = AuthRepository();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Dashboard'),
        actions: [
          IconButton(
            onPressed: () async {
              await authRepository.logout();

              if (!context.mounted) return;

              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (_) => false,
              );
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: const Center(
        child: Text(
          'Admin dashboard will be connected next.',
          style: TextStyle(fontSize: 18),
        ),
      ),
    );
  }
}