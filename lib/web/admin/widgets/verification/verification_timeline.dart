import 'package:flutter/material.dart';

import '../../models/verification/provider_verification.dart';

class VerificationTimeline extends StatelessWidget {
  final ProviderVerificationApplication application;

  const VerificationTimeline({
    super.key,
    required this.application,
  });

  @override
  Widget build(BuildContext context) {
    final entries = application.timeline.isNotEmpty
        ? application.timeline
        : _generateFallbackTimeline(application);

    return Container(
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(
                Icons.timeline_rounded,
                size: 19,
                color: Color(0xFF374151),
              ),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Verification Timeline',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          if (entries.isEmpty)
            const _TimelineEmptyState()
          else
            Column(
              children: [
                for (var index = 0;
                    index < entries.length;
                    index++)
                  VerificationTimelineTile(
                    entry: entries[index],
                    showConnector: index != entries.length - 1,
                  ),
              ],
            ),
        ],
      ),
    );
  }

  List<VerificationTimelineEntry> _generateFallbackTimeline(
    ProviderVerificationApplication application,
  ) {
    final isUnderReview =
        application.status ==
        VerificationApplicationStatus.underReview;

    final isApproved =
        application.status ==
        VerificationApplicationStatus.approved;

    final isRejected =
        application.status ==
        VerificationApplicationStatus.rejected;

    return [
      VerificationTimelineEntry(
        id: 'submitted',
        title: 'Application submitted',
        description: 'Provider submitted the verification application.',
        timestamp: application.submittedAt,
        status: VerificationTimelineStatus.completed,
      ),
      VerificationTimelineEntry(
        id: 'documents_received',
        title: 'Documents received',
        description:
            '${application.documents.length} verification documents received.',
        timestamp: application.submittedAt,
        status: VerificationTimelineStatus.completed,
      ),
      VerificationTimelineEntry(
        id: 'initial_review',
        title: 'Initial review',
        description: isUnderReview
            ? 'The application is currently being reviewed.'
            : isApproved || isRejected
                ? 'Initial application review completed.'
                : 'Waiting for an administrator to begin the review.',
        status: isUnderReview
            ? VerificationTimelineStatus.inProgress
            : isApproved || isRejected
                ? VerificationTimelineStatus.completed
                : VerificationTimelineStatus.pending,
      ),
      VerificationTimelineEntry(
        id: 'document_validation',
        title: 'Document validation',
        description: isApproved || isRejected
            ? 'Required documents have been reviewed.'
            : 'Documents are waiting for validation.',
        status: isApproved || isRejected
            ? VerificationTimelineStatus.completed
            : VerificationTimelineStatus.pending,
      ),
      VerificationTimelineEntry(
        id: 'decision',
        title: 'Approval decision',
        description: isApproved
            ? 'The provider application was approved.'
            : isRejected
                ? 'The provider application was rejected.'
                : 'Waiting for the final approval decision.',
        status: isApproved
            ? VerificationTimelineStatus.completed
            : isRejected
                ? VerificationTimelineStatus.failed
                : VerificationTimelineStatus.pending,
      ),
      VerificationTimelineEntry(
        id: 'notification',
        title: 'Provider notification',
        description: isApproved || isRejected
            ? 'The provider has been prepared for notification.'
            : 'The provider will be notified after a decision.',
        status: isApproved || isRejected
            ? VerificationTimelineStatus.completed
            : VerificationTimelineStatus.pending,
      ),
    ];
  }
}

class VerificationTimelineTile extends StatelessWidget {
  final VerificationTimelineEntry entry;
  final bool showConnector;

  const VerificationTimelineTile({
    super.key,
    required this.entry,
    required this.showConnector,
  });

  @override
  Widget build(BuildContext context) {
    final visual = _TimelineVisual.fromStatus(entry.status);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 32,
            child: Column(
              children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: visual.backgroundColor,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: visual.borderColor,
                    ),
                  ),
                  child: Icon(
                    visual.icon,
                    size: visual.iconSize,
                    color: visual.foregroundColor,
                  ),
                ),
                if (showConnector)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(
                        vertical: 4,
                      ),
                      color: visual.connectorColor,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(
                bottom: showConnector ? 19 : 0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          entry.title,
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            color: entry.status ==
                                    VerificationTimelineStatus.pending
                                ? const Color(0xFF9CA3AF)
                                : const Color(0xFF1F2937),
                          ),
                        ),
                      ),
                      if (entry.timestamp?.trim().isNotEmpty == true)
                        Padding(
                          padding: const EdgeInsets.only(left: 10),
                          child: Text(
                            entry.timestamp!,
                            style: const TextStyle(
                              fontSize: 10.5,
                              color: Color(0xFF9CA3AF),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    entry.description,
                    style: const TextStyle(
                      fontSize: 11.8,
                      height: 1.45,
                      color: Color(0xFF6B7280),
                    ),
                  ),
                  if (entry.adminName?.trim().isNotEmpty == true) ...[
                    const SizedBox(height: 5),
                    Row(
                      children: [
                        const Icon(
                          Icons.admin_panel_settings_outlined,
                          size: 13,
                          color: Color(0xFF9CA3AF),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          entry.adminName!,
                          style: const TextStyle(
                            fontSize: 10.5,
                            color: Color(0xFF9CA3AF),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineEmptyState extends StatelessWidget {
  const _TimelineEmptyState();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 26),
      child: Center(
        child: Column(
          children: [
            Icon(
              Icons.timeline_outlined,
              size: 36,
              color: Color(0xFFCBD5E1),
            ),
            SizedBox(height: 10),
            Text(
              'No timeline entries',
              style: TextStyle(
                color: Color(0xFF374151),
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 4),
            Text(
              'Verification progress will appear here.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF9CA3AF),
                fontSize: 11.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimelineVisual {
  final IconData icon;
  final double iconSize;
  final Color foregroundColor;
  final Color backgroundColor;
  final Color borderColor;
  final Color connectorColor;

  const _TimelineVisual({
    required this.icon,
    required this.iconSize,
    required this.foregroundColor,
    required this.backgroundColor,
    required this.borderColor,
    required this.connectorColor,
  });

  factory _TimelineVisual.fromStatus(
    VerificationTimelineStatus status,
  ) {
    return switch (status) {
      VerificationTimelineStatus.completed =>
        const _TimelineVisual(
          icon: Icons.check_rounded,
          iconSize: 15,
          foregroundColor: Colors.white,
          backgroundColor: Color(0xFF16A34A),
          borderColor: Color(0xFF16A34A),
          connectorColor: Color(0xFFBBF7D0),
        ),
      VerificationTimelineStatus.inProgress =>
        const _TimelineVisual(
          icon: Icons.more_horiz_rounded,
          iconSize: 15,
          foregroundColor: Color(0xFF2563EB),
          backgroundColor: Color(0xFFDBEAFE),
          borderColor: Color(0xFF93C5FD),
          connectorColor: Color(0xFFBFDBFE),
        ),
      VerificationTimelineStatus.pending =>
        const _TimelineVisual(
          icon: Icons.circle,
          iconSize: 7,
          foregroundColor: Color(0xFF9CA3AF),
          backgroundColor: Color(0xFFF3F4F6),
          borderColor: Color(0xFFD1D5DB),
          connectorColor: Color(0xFFE5E7EB),
        ),
      VerificationTimelineStatus.failed =>
        const _TimelineVisual(
          icon: Icons.close_rounded,
          iconSize: 15,
          foregroundColor: Colors.white,
          backgroundColor: Color(0xFFDC2626),
          borderColor: Color(0xFFDC2626),
          connectorColor: Color(0xFFFECACA),
        ),
    };
  }
}