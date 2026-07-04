import 'package:flutter/material.dart';

import '../../router/app_router.dart';

class AdminSidebar extends StatelessWidget {
  final String currentRoute;
  final ValueChanged<String> onNavigate;
  final bool compact;

  const AdminSidebar({
    super.key,
    required this.currentRoute,
    required this.onNavigate,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final items = [
      _NavItem(label: 'Dashboard', icon: Icons.dashboard_rounded, route: AdminRoute.dashboard),
      _NavItem(label: 'Users', icon: Icons.people_alt_rounded, route: AdminRoute.users),
      _NavItem(label: 'Providers', icon: Icons.storefront_rounded, route: AdminRoute.providers),
      _NavItem(label: 'Bookings', icon: Icons.event_note_rounded, route: AdminRoute.bookings),
      _NavItem(label: 'Promotions', icon: Icons.local_offer_rounded, route: AdminRoute.promotions),
      _NavItem(label: 'Reports', icon: Icons.insights_rounded, route: AdminRoute.reports),
      _NavItem(label: 'Settings', icon: Icons.settings_rounded, route: AdminRoute.settings),
    ];

    return Container(
      width: compact ? 240 : 280,
      color: Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Text(
              'Feasta Admin',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
          ),
          const SizedBox(height: 12),
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: ListTile(
                dense: true,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                tileColor: currentRoute == item.route ? const Color(0xFFFFF3ED) : null,
                selectedTileColor: const Color(0xFFFFF3ED),
                leading: Icon(item.icon, color: currentRoute == item.route ? const Color(0xFFFF6333) : Colors.grey[700]),
                title: Text(
                  item.label,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: currentRoute == item.route ? const Color(0xFFFF6333) : Colors.black87,
                  ),
                ),
                onTap: () => onNavigate(item.route),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem {
  final String label;
  final IconData icon;
  final String route;

  const _NavItem({required this.label, required this.icon, required this.route});
}
