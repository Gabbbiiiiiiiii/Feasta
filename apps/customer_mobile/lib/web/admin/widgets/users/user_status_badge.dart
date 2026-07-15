import 'package:flutter/material.dart';

class UserStatusBadge extends StatelessWidget {
  final bool isActive;
  final bool isBlocked;

  const UserStatusBadge({
    super.key,
    required this.isActive,
    required this.isBlocked,
  });

  @override
  Widget build(BuildContext context) {
    final configuration = _configuration();

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 11,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: configuration.backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: configuration.foregroundColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 7),
          Text(
            configuration.label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: configuration.foregroundColor,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );
  }

  _StatusConfiguration _configuration() {
    if (isBlocked) {
      return const _StatusConfiguration(
        label: 'Blocked',
        backgroundColor: Color(0xFFFEE2E2),
        foregroundColor: Color(0xFFB91C1C),
      );
    }

    if (!isActive) {
      return const _StatusConfiguration(
        label: 'Disabled',
        backgroundColor: Color(0xFFF1F5F9),
        foregroundColor: Color(0xFF475569),
      );
    }

    return const _StatusConfiguration(
      label: 'Active',
      backgroundColor: Color(0xFFDCFCE7),
      foregroundColor: Color(0xFF15803D),
    );
  }
}

class _StatusConfiguration {
  final String label;
  final Color backgroundColor;
  final Color foregroundColor;

  const _StatusConfiguration({
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
  });
}