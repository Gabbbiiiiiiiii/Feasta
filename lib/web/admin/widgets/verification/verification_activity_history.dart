import 'package:flutter/material.dart';

import '../../models/verification/provider_verification.dart';

class VerificationActivityHistory extends StatelessWidget {
  final ProviderVerificationApplication application;
  final int maxVisibleItems;

  const VerificationActivityHistory({
    super.key,
    required this.application,
    this.maxVisibleItems = 8,
  });

  @override
  Widget build(BuildContext context) {
    final activities = application.activities.isNotEmpty
        ? application.activities.take(maxVisibleItems).toList()
        : _fallbackActivities(application);

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
          Row(
            children: [
              const Icon(
                Icons.history_rounded,
                size: 19,
                color: Color(0xFF374151),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Activity History',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Text(
                  '${activities.length}',
                  style: const TextStyle(
                    color: Color(0xFF4B5563),
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (activities.isEmpty)
            const _ActivityEmptyState()
          else
            Column(
              children: [
                for (var index = 0;
                    index < activities.length;
                    index++) ...[
                  VerificationActivityTile(
                    activity: activities[index],
                  ),
                  if (index != activities.length - 1)
                    const Divider(
                      height: 25,
                      color: Color(0xFFE5E7EB),
                    ),
                ],
              ],
            ),
        ],
      ),
    );
  }

  List<VerificationActivity> _fallbackActivities(
    ProviderVerificationApplication application,
  ) {
    final activities = <VerificationActivity>[
      VerificationActivity(
        id: 'submitted',
        type: VerificationActivityType.applicationSubmitted,
        title: 'Application submitted',
        description:
            '${application.businessName} submitted a provider verification application.',
        timestamp: application.submittedAt,
        actorName: application.ownerName,
      ),
    ];

    if (application.status ==
        VerificationApplicationStatus.underReview) {
      activities.add(
        const VerificationActivity(
          id: 'review_started',
          type: VerificationActivityType.reviewStarted,
          title: 'Review started',
          description:
              'An administrator started reviewing this application.',
          timestamp: 'In progress',
          actorName: 'Administrator',
        ),
      );
    }

    if (application.status ==
        VerificationApplicationStatus.approved) {
      activities.add(
        const VerificationActivity(
          id: 'approved',
          type: VerificationActivityType.approved,
          title: 'Provider approved',
          description:
              'The provider application passed the verification process.',
          timestamp: 'Completed',
          actorName: 'Administrator',
        ),
      );
    }

    if (application.status ==
        VerificationApplicationStatus.rejected) {
      activities.add(
        const VerificationActivity(
          id: 'rejected',
          type: VerificationActivityType.rejected,
          title: 'Provider rejected',
          description:
              'The provider application did not meet the verification requirements.',
          timestamp: 'Completed',
          actorName: 'Administrator',
        ),
      );
    }

    return activities.reversed.toList();
  }
}

class VerificationActivityTile extends StatelessWidget {
  final VerificationActivity activity;

  const VerificationActivityTile({
    super.key,
    required this.activity,
  });

  @override
  Widget build(BuildContext context) {
    final visual = _ActivityVisual.fromType(activity.type);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: visual.backgroundColor,
            borderRadius: BorderRadius.circular(11),
          ),
          child: Icon(
            visual.icon,
            size: 19,
            color: visual.foregroundColor,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      activity.title,
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF1F2937),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    activity.timestamp,
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: Color(0xFF9CA3AF),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                activity.description,
                style: const TextStyle(
                  fontSize: 11.8,
                  height: 1.45,
                  color: Color(0xFF6B7280),
                ),
              ),
              if (activity.actorName?.trim().isNotEmpty == true) ...[
                const SizedBox(height: 7),
                Row(
                  children: [
                    const Icon(
                      Icons.person_outline_rounded,
                      size: 13,
                      color: Color(0xFF9CA3AF),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      activity.actorName!,
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: Color(0xFF9CA3AF),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ActivityEmptyState extends StatelessWidget {
  const _ActivityEmptyState();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 26),
      child: Center(
        child: Column(
          children: [
            Icon(
              Icons.history_toggle_off_rounded,
              size: 38,
              color: Color(0xFFCBD5E1),
            ),
            SizedBox(height: 10),
            Text(
              'No activity recorded',
              style: TextStyle(
                color: Color(0xFF374151),
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 4),
            Text(
              'Administrator and provider actions will appear here.',
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

class _ActivityVisual {
  final IconData icon;
  final Color foregroundColor;
  final Color backgroundColor;

  const _ActivityVisual({
    required this.icon,
    required this.foregroundColor,
    required this.backgroundColor,
  });

  factory _ActivityVisual.fromType(
    VerificationActivityType type,
  ) {
    return switch (type) {
      VerificationActivityType.applicationSubmitted =>
        const _ActivityVisual(
          icon: Icons.upload_file_rounded,
          foregroundColor: Color(0xFF2563EB),
          backgroundColor: Color(0xFFDBEAFE),
        ),
      VerificationActivityType.reviewStarted =>
        const _ActivityVisual(
          icon: Icons.manage_search_rounded,
          foregroundColor: Color(0xFF7C3AED),
          backgroundColor: Color(0xFFEDE9FE),
        ),
      VerificationActivityType.documentVerified =>
        const _ActivityVisual(
          icon: Icons.task_alt_rounded,
          foregroundColor: Color(0xFF15803D),
          backgroundColor: Color(0xFFDCFCE7),
        ),
      VerificationActivityType.documentInvalid =>
        const _ActivityVisual(
          icon: Icons.error_outline_rounded,
          foregroundColor: Color(0xFFDC2626),
          backgroundColor: Color(0xFFFEE2E2),
        ),
      VerificationActivityType.noteUpdated =>
        const _ActivityVisual(
          icon: Icons.sticky_note_2_outlined,
          foregroundColor: Color(0xFFD97706),
          backgroundColor: Color(0xFFFFF3C4),
        ),
      VerificationActivityType.approved =>
        const _ActivityVisual(
          icon: Icons.verified_rounded,
          foregroundColor: Color(0xFF15803D),
          backgroundColor: Color(0xFFDCFCE7),
        ),
      VerificationActivityType.rejected =>
        const _ActivityVisual(
          icon: Icons.cancel_outlined,
          foregroundColor: Color(0xFFDC2626),
          backgroundColor: Color(0xFFFEE2E2),
        ),
      VerificationActivityType.providerNotified =>
        const _ActivityVisual(
          icon: Icons.notifications_active_outlined,
          foregroundColor: Color(0xFF2563EB),
          backgroundColor: Color(0xFFDBEAFE),
        ),
    };
  }
}