import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radius.dart';
import '../../../core/theme/app_sizes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';

class ProviderReviewCard extends StatelessWidget {
  const ProviderReviewCard({required this.data, super.key});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final firstName = data['customerFirstName']?.toString().trim() ?? '';
    final lastName = data['customerLastName']?.toString().trim() ?? '';

    final fullName = [
      firstName,
      lastName,
    ].where((value) => value.isNotEmpty).join(' ');

    final displayName = fullName.isEmpty ? 'Customer' : fullName;

    final rawRating = data['rating'];

    final rating = rawRating is num ? rawRating.toInt().clamp(0, 5) : 0;

    final comment = data['comment']?.toString().trim() ?? '';
    final providerReply = data['providerReply']?.toString().trim() ?? '';

    final dateText = formatProviderReviewDate(data['createdAt']);

    final replyDateText = formatProviderReviewDate(data['providerReplyAt']);

    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.primarySubtle,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  firstName.isNotEmpty ? firstName[0].toUpperCase() : 'F',
                  style: AppTypography.label.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.cardTitle.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (dateText.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        dateText,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: AppSpacing.md),

          Semantics(
            label: '$rating out of 5 stars',
            container: true,
            child: ExcludeSemantics(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(
                  5,
                  (index) => Icon(
                    index < rating
                        ? Icons.star_rounded
                        : Icons.star_border_rounded,
                    size: 18,
                    color: const Color(0xFFFFB020),
                  ),
                ),
              ),
            ),
          ),

          if (comment.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              comment,
              style: AppTypography.body.copyWith(
                color: AppColors.secondaryTextAccessible,
                height: 1.45,
              ),
            ),
          ],

          if (providerReply.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.primarySubtle,
                borderRadius: BorderRadius.circular(AppRadius.large),
                border: Border.all(
                  color: AppColors.primary.withValues(alpha: 0.18),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.storefront_rounded,
                        size: AppSizes.iconMedium,
                        color: AppColors.primaryStrong,
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      Expanded(
                        child: Text(
                          'Provider response',
                          style: AppTypography.label.copyWith(
                            color: AppColors.primaryStrong,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      if (replyDateText.isNotEmpty) ...[
                        const SizedBox(width: AppSpacing.sm),
                        Flexible(
                          child: Text(
                            replyDateText,
                            textAlign: TextAlign.end,
                            style: AppTypography.caption.copyWith(
                              color: AppColors.secondaryTextAccessible,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    providerReply,
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.mainText,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

String formatProviderReviewDate(dynamic value) {
  if (value is! Timestamp) {
    return '';
  }

  final date = value.toDate();

  const months = <String>[
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  return '${months[date.month - 1]} ${date.day}, ${date.year}';
}
