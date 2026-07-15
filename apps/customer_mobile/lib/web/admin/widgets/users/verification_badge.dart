import 'package:flutter/material.dart';

class VerificationBadge extends StatelessWidget {
  final String? status;
  final bool isProvider;

  const VerificationBadge({
    super.key,
    required this.status,
    required this.isProvider,
  });

  @override
  Widget build(BuildContext context) {
    if (!isProvider) {
      return Text(
        '—',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: const Color(0xFF94A3B8),
            ),
      );
    }

    final configuration = _configuration(status);

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

  _VerificationConfiguration _configuration(String? value) {
    switch (value?.toLowerCase()) {
      case 'verified':
      case 'approved':
        return const _VerificationConfiguration(
          label: 'Verified',
          backgroundColor: Color(0xFFDCFCE7),
          foregroundColor: Color(0xFF15803D),
        );

      case 'rejected':
        return const _VerificationConfiguration(
          label: 'Rejected',
          backgroundColor: Color(0xFFFEE2E2),
          foregroundColor: Color(0xFFB91C1C),
        );

      case 'suspended':
        return const _VerificationConfiguration(
          label: 'Suspended',
          backgroundColor: Color(0xFFF1F5F9),
          foregroundColor: Color(0xFF475569),
        );

      case 'pending':
      default:
        return const _VerificationConfiguration(
          label: 'Pending',
          backgroundColor: Color(0xFFFEF3C7),
          foregroundColor: Color(0xFFB45309),
        );
    }
  }
}

class _VerificationConfiguration {
  final String label;
  final Color backgroundColor;
  final Color foregroundColor;

  const _VerificationConfiguration({
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
  });
}