import 'package:flutter/material.dart';

import '../../models/verification/provider_verification.dart';

class VerificationStatusBadge extends StatelessWidget {
  final VerificationApplicationStatus status;

  const VerificationStatusBadge({
    super.key,
    required this.status,
  });

  @override
  Widget build(BuildContext context) {
    final visual = _statusVisual(status);

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 9,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: visual.backgroundColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        visual.label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: visual.foregroundColor,
        ),
      ),
    );
  }

  _StatusVisual _statusVisual(
    VerificationApplicationStatus status,
  ) {
    return switch (status) {
      VerificationApplicationStatus.pending => const _StatusVisual(
          label: 'Pending',
          foregroundColor: Color(0xFFB45309),
          backgroundColor: Color(0xFFFFF3C4),
        ),
      VerificationApplicationStatus.underReview => const _StatusVisual(
          label: 'Under Review',
          foregroundColor: Color(0xFF1D4ED8),
          backgroundColor: Color(0xFFDBEAFE),
        ),
      VerificationApplicationStatus.approved => const _StatusVisual(
          label: 'Approved',
          foregroundColor: Color(0xFF15803D),
          backgroundColor: Color(0xFFDCFCE7),
        ),
      VerificationApplicationStatus.rejected => const _StatusVisual(
          label: 'Rejected',
          foregroundColor: Color(0xFFDC2626),
          backgroundColor: Color(0xFFFEE2E2),
        ),
    };
  }
}

class _StatusVisual {
  final String label;
  final Color foregroundColor;
  final Color backgroundColor;

  const _StatusVisual({
    required this.label,
    required this.foregroundColor,
    required this.backgroundColor,
  });
}