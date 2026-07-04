import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../admin/router/app_router.dart';

class AdminTopBar extends StatelessWidget {
  final VoidCallback onMenuPressed;
  final String currentRoute;
  final ValueChanged<String> onNavigate;

  const AdminTopBar({
    super.key,
    required this.onMenuPressed,
    required this.currentRoute,
    required this.onNavigate,
  });

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return AppBar(
      elevation: 0,
      backgroundColor: Colors.white,
      foregroundColor: Colors.black87,
      leading: IconButton(
        onPressed: onMenuPressed,
        icon: const Icon(Icons.menu_rounded),
      ),
      title: Text(_routeLabel(currentRoute)),
      actions: [
        TextButton.icon(
          onPressed: () => onNavigate(AdminRoute.promotions),
          icon: const Icon(Icons.local_offer_rounded),
          label: const Text('Promotions'),
        ),
        const SizedBox(width: 8),
        Padding(
          padding: const EdgeInsets.only(right: 16),
          child: Chip(
            avatar: const Icon(Icons.person_rounded, size: 18),
            label: Text(user?.email?.split('@').first ?? 'Admin'),
          ),
        ),
      ],
    );
  }

  String _routeLabel(String route) {
    switch (route) {
      case AdminRoute.users:
        return 'Users';
      case AdminRoute.providers:
        return 'Providers';
      case AdminRoute.bookings:
        return 'Bookings';
      case AdminRoute.promotions:
        return 'Promotions';
      case AdminRoute.reports:
        return 'Reports';
      case AdminRoute.settings:
        return 'Settings';
      case AdminRoute.dashboard:
      default:
        return 'Dashboard';
    }
  }
}
