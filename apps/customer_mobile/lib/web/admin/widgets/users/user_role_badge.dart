import 'package:flutter/material.dart';

class UserRoleBadge extends StatelessWidget {
  final String role;

  const UserRoleBadge({
    super.key,
    required this.role,
  });

  @override
  Widget build(BuildContext context) {
    final configuration = _configuration(role);

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 11,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: configuration.backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        configuration.label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: configuration.foregroundColor,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }

  _BadgeConfiguration _configuration(String value) {
    switch (value.toLowerCase()) {
      case 'provider':
        return const _BadgeConfiguration(
          label: 'Provider',
          backgroundColor: Color(0xFFEDE9FE),
          foregroundColor: Color(0xFF6D28D9),
        );

      case 'admin':
        return const _BadgeConfiguration(
          label: 'Administrator',
          backgroundColor: Color(0xFFFEE2E2),
          foregroundColor: Color(0xFFB91C1C),
        );

      case 'customer':
      default:
        return const _BadgeConfiguration(
          label: 'Customer',
          backgroundColor: Color(0xFFFFF3E8),
          foregroundColor: Color(0xFFE85D04),
        );
    }
  }
}

class _BadgeConfiguration {
  final String label;
  final Color backgroundColor;
  final Color foregroundColor;

  const _BadgeConfiguration({
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
  });
}