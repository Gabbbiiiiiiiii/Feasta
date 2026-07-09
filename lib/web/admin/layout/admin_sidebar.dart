import 'package:flutter/material.dart';

import '../../admin/router/app_router.dart';

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
      _NavItem(
        label: 'Dashboard',
        icon: Icons.dashboard_rounded,
        route: AdminRoute.dashboard,
      ),
      _NavItem(
        label: 'User Management',
        icon: Icons.people_alt_rounded,
        route: AdminRoute.users,
      ),
      _NavItem(
        label: 'Provider Verification',
        icon: Icons.verified_user_rounded,
        route: AdminRoute.verification,
      ),
      _NavItem(
        label: 'Booking Monitoring',
        icon: Icons.event_note_rounded,
        route: AdminRoute.bookings,
      ),
      _NavItem(
        label: 'Payment Monitoring',
        icon: Icons.payments_rounded,
        route: 'payment_monitoring',
      ),
      _NavItem(
        label: 'Review Management',
        icon: Icons.rate_review_rounded,
        route: 'review_management',
      ),
      _NavItem(
        label: 'Reports',
        icon: Icons.analytics_rounded,
        route: AdminRoute.reports,
      ),
    ];

    return Container(
      width: compact ? 252 : 292,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.only(
        topRight: Radius.circular(24),
        bottomRight: Radius.circular(24),
      ),
        boxShadow: [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 18,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 20),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => onNavigate(AdminRoute.dashboard),

                    // Remove all visual effects
                    hoverColor: Colors.transparent,
                    splashColor: Colors.transparent,
                    highlightColor: Colors.transparent,
                    focusColor: Colors.transparent,

                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 8,
                      ),
                      child: Row(
                        children: [
                          Image.asset(
                            'assets/images/feasta_logo.png',
                            height: 42,
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'FEASTA',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: const Color(0xFF111827),
                                  letterSpacing: 1.2,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: ListView.separated(
                  padding: EdgeInsets.zero,
                  itemCount: items.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    final isActive = currentRoute == item.route;

                    return MouseRegion(
                      cursor: SystemMouseCursors.click,
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          hoverColor: const Color(0x1AFF6B00),
                          onTap: () => onNavigate(item.route),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                            decoration: BoxDecoration(
                              color: isActive ? const Color(0xFFFFF3EB) : Colors.white,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(
                                    color: isActive ? const Color(0xFFFFE9DB) : const Color(0xFFF8F9FB),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: Icon(
                                    item.icon,
                                    size: 20,
                                    color: isActive ? const Color(0xFFFF6B00) : const Color(0xFF6B7280),
                                  ),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Text(
                                    item.label,
                                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                          fontWeight: FontWeight.w500,
                                          color: isActive ? const Color(0xFF111827) : const Color(0xFF475569),
                                        ),
                                  ),
                                ),
                                if (isActive)
                                  Container(
                                    width: 4,
                                    height: 40,
                                    decoration: const BoxDecoration(
                                      color: Color(0xFFFF6B00),
                                      borderRadius: BorderRadius.horizontal(left: Radius.circular(999)),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 12),
              MouseRegion(
                cursor: SystemMouseCursors.click,
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    hoverColor: const Color(0x0AEF4444),
                    onTap: () => onNavigate(AdminRoute.dashboard),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFECECF1)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.logout_rounded, color: Color(0xFFEF4444)),
                          const SizedBox(width: 12),
                          Text(
                            'Logout',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  color: const Color(0xFFEF4444),
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
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
