import 'package:flutter/material.dart';

import 'customer_register_screen.dart';
import 'provider_register_screen.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Choose Account Type'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const SizedBox(height: 20),
            const Text(
              'How would you like to use Feasta?',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Choose the account type that best fits your role.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 40),
            _RoleCard(
              icon: Icons.person_outline,
              title: 'Customer',
              description: 'Browse, customize, and book catering services.',
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const CustomerRegisterScreen(),
                  ),
                );
              },
            ),
            const SizedBox(height: 18),
            _RoleCard(
              icon: Icons.storefront_outlined,
              title: 'Provider',
              description: 'Register your catering or event service business and manage bookings.',
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ProviderRegisterScreen(),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final VoidCallback onTap;

  const _RoleCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 30,
              backgroundColor: primary.withOpacity(0.1),
              child: Icon(icon, color: primary, size: 30),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: const TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}