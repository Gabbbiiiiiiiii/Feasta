import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../features/presentation/screens/login_screen.dart';

bool get isGuestUser {
  return FirebaseAuth.instance.currentUser == null;
}

Future<bool> requireLogin(
  BuildContext context, {
  String message = 'Please log in or create an account to continue.',
  Widget? redirectAfterLogin,
}) async {
  final user = FirebaseAuth.instance.currentUser;

  if (user != null) {
    return true;
  }

  final shouldLogin = await showDialog<bool>(
    context: context,
    builder: (dialogContext) {
      return AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
        title: const Text(
          'Login required',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Continue browsing'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Log in / Sign up'),
          ),
        ],
      );
    },
  );

  if (shouldLogin != true) {
    return false;
  }

  if (!context.mounted) {
    return false;
  }

  await Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => LoginScreen(
        canSkip: false,
        redirectAfterLogin: redirectAfterLogin,
      ),
    ),
  );

  return FirebaseAuth.instance.currentUser != null;
}