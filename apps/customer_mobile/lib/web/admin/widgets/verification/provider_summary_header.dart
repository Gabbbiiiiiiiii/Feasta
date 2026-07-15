import 'package:flutter/material.dart';

import '../../models/verification/provider_verification.dart';
import 'verification_status_badge.dart';

class ProviderSummaryHeader extends StatelessWidget {
  final ProviderVerificationApplication application;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  final VoidCallback onViewProfile;
  final bool isProcessing;

  const ProviderSummaryHeader({
    super.key,
    required this.application,
    required this.onApprove,
    required this.onReject,
    required this.onViewProfile,
    this.isProcessing = false,
  });

  bool get _isFinalStatus {
    return application.status ==
            VerificationApplicationStatus.approved ||
        application.status ==
            VerificationApplicationStatus.rejected;
  }

  bool get _actionsDisabled {
    return isProcessing || _isFinalStatus;
  }

  bool get _approveDisabled {
    return _actionsDisabled || !application.canBeApproved;
  }

  String get _businessInitials {
    final words = application.businessName
        .trim()
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .toList();

    if (words.isEmpty) {
      return 'P';
    }

    if (words.length == 1) {
      return words.first.substring(0, 1).toUpperCase();
    }

    return '${words.first[0]}${words.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final stackEverything = constraints.maxWidth < 680;
        final compactActions = constraints.maxWidth < 920;

        final identity = _ProviderIdentity(
          application: application,
          initials: _businessInitials,
        );

        final actions = _ProviderHeaderActions(
          actionsDisabled: _actionsDisabled,
          approveDisabled: _approveDisabled,
          isProcessing: isProcessing,
          onViewProfile: onViewProfile,
          onReject: onReject,
          onApprove: onApprove,
        );

        if (stackEverything) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              identity,
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: actions,
              ),
              if (_isFinalStatus) ...[
                const SizedBox(height: 14),
                _ProcessedApplicationMessage(
                  status: application.status,
                ),
              ],
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: identity),
                const SizedBox(width: 18),
                ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: compactActions ? 290 : 420,
                  ),
                  child: actions,
                ),
              ],
            ),
            if (_isFinalStatus) ...[
              const SizedBox(height: 14),
              _ProcessedApplicationMessage(
                status: application.status,
              ),
            ],
          ],
        );
      },
    );
  }
}

class _ProviderIdentity extends StatelessWidget {
  final ProviderVerificationApplication application;
  final String initials;

  const _ProviderIdentity({
    required this.application,
    required this.initials,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 68,
          height: 68,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFFFFF1EC),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: const Color(0xFFFFD6C8),
            ),
          ),
          child: Text(
            initials,
            style: const TextStyle(
              color: Color(0xFFFF6333),
              fontSize: 19,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 15),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 9,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    application.businessName,
                    style: const TextStyle(
                      color: Color(0xFF111827),
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.25,
                    ),
                  ),
                  VerificationStatusBadge(
                    status: application.status,
                  ),
                ],
              ),
              const SizedBox(height: 7),
              Wrap(
                spacing: 8,
                runSpacing: 5,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _HeaderMetadata(
                    icon: Icons.calendar_today_outlined,
                    text: 'Submitted ${application.submittedAt}',
                  ),
                  const _MetadataSeparator(),
                  _HeaderMetadata(
                    icon: Icons.confirmation_number_outlined,
                    text: application.id,
                  ),
                ],
              ),
              const SizedBox(height: 9),
              Text(
                application.providerType,
                style: const TextStyle(
                  color: Color(0xFF6B7280),
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _HeaderMetadata extends StatelessWidget {
  final IconData icon;
  final String text;

  const _HeaderMetadata({
    required this.icon,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 14,
          color: const Color(0xFF9CA3AF),
        ),
        const SizedBox(width: 5),
        Text(
          text,
          style: const TextStyle(
            color: Color(0xFF9CA3AF),
            fontSize: 12.5,
          ),
        ),
      ],
    );
  }
}

class _MetadataSeparator extends StatelessWidget {
  const _MetadataSeparator();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 3,
      height: 3,
      decoration: const BoxDecoration(
        color: Color(0xFFD1D5DB),
        shape: BoxShape.circle,
      ),
    );
  }
}

class _ProviderHeaderActions extends StatelessWidget {
  final bool actionsDisabled;
  final bool approveDisabled;
  final bool isProcessing;
  final VoidCallback onViewProfile;
  final VoidCallback onReject;
  final VoidCallback onApprove;

  const _ProviderHeaderActions({
    required this.actionsDisabled,
    required this.approveDisabled,
    required this.isProcessing,
    required this.onViewProfile,
    required this.onReject,
    required this.onApprove,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.end,
      spacing: 9,
      runSpacing: 9,
      children: [
        OutlinedButton.icon(
          onPressed: isProcessing ? null : onViewProfile,
          icon: const Icon(
            Icons.visibility_outlined,
            size: 17,
          ),
          label: const Text('View Profile'),
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFF374151),
            backgroundColor: Colors.white,
            side: const BorderSide(
              color: Color(0xFFD1D5DB),
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: 15,
              vertical: 14,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        FilledButton.icon(
          onPressed: actionsDisabled ? null : onReject,
          icon: const Icon(
            Icons.close_rounded,
            size: 17,
          ),
          label: const Text('Reject'),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFFEF4444),
            foregroundColor: Colors.white,
            disabledBackgroundColor: const Color(0xFFF3F4F6),
            disabledForegroundColor: const Color(0xFF9CA3AF),
            padding: const EdgeInsets.symmetric(
              horizontal: 17,
              vertical: 14,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        FilledButton.icon(
          onPressed: approveDisabled ? null : onApprove,
          icon: isProcessing
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(
                  Icons.check_rounded,
                  size: 18,
                ),
          label: Text(
            isProcessing ? 'Processing' : 'Approve',
          ),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF16A34A),
            foregroundColor: Colors.white,
            disabledBackgroundColor: const Color(0xFFF3F4F6),
            disabledForegroundColor: const Color(0xFF9CA3AF),
            padding: const EdgeInsets.symmetric(
              horizontal: 17,
              vertical: 14,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      ],
    );
  }
}

class _ProcessedApplicationMessage extends StatelessWidget {
  final VerificationApplicationStatus status;

  const _ProcessedApplicationMessage({
    required this.status,
  });

  @override
  Widget build(BuildContext context) {
    final isApproved =
        status == VerificationApplicationStatus.approved;

    final foregroundColor = isApproved
        ? const Color(0xFF15803D)
        : const Color(0xFFB91C1C);

    final backgroundColor = isApproved
        ? const Color(0xFFF0FDF4)
        : const Color(0xFFFEF2F2);

    final borderColor = isApproved
        ? const Color(0xFFBBF7D0)
        : const Color(0xFFFECACA);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: 13,
        vertical: 11,
      ),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        children: [
          Icon(
            isApproved
                ? Icons.verified_rounded
                : Icons.cancel_outlined,
            size: 18,
            color: foregroundColor,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              isApproved
                  ? 'This provider application has already been approved.'
                  : 'This provider application has already been rejected.',
              style: TextStyle(
                color: foregroundColor,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}