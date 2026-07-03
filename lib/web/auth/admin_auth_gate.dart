import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../layout/admin_shell.dart';

class AdminAuthGate extends StatefulWidget {
  const AdminAuthGate({super.key});

  @override
  State<AdminAuthGate> createState() => _AdminAuthGateState();
}

class _AdminAuthGateState extends State<AdminAuthGate> {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _isSubmitting = false;
  String? _errorMessage;

  Future<bool> _isAdminUser(String uid) async {
    final doc = await _firestore.collection('users').doc(uid).get();
    final role = doc.data()?['role']?.toString();
    return role == 'admin';
  }

  Future<void> _signIn() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final credential = await _auth.signInWithEmailAndPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
      );

      final isAdmin = await _isAdminUser(credential.user!.uid);

      if (!mounted) return;

      if (!isAdmin) {
        await _auth.signOut();
        setState(() {
          _errorMessage = 'This account does not have admin access.';
        });
        return;
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = error.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: _auth.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final user = snapshot.data;
        if (user == null) {
          return Scaffold(
            backgroundColor: const Color(0xFFF6F7FB),
            body: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Feasta Admin',
                          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Sign in to manage Feasta operations.',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 24),
                        TextField(
                          controller: _emailController,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _passwordController,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Password',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 16),
                        if (_errorMessage != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Text(
                              _errorMessage!,
                              style: const TextStyle(color: Colors.redAccent),
                            ),
                          ),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: _isSubmitting ? null : _signIn,
                            icon: const Icon(Icons.login_rounded),
                            label: _isSubmitting
                                ? const SizedBox(
                                    height: 18,
                                    width: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Text('Sign In'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        }

        return const AdminShell();
      },
    );
  }
}
