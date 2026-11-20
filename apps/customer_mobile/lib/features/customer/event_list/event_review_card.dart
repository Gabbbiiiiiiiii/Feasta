import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radius.dart';
import '../../../core/theme/app_sizes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';

// Original FEASTA review primitives from 462489b7, BookingSummaryScreen.
class EventReviewCard extends StatelessWidget {
  const EventReviewCard({
    required this.icon,
    required this.title,
    required this.children,
    super.key,
  });

  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardHeading(icon: icon, title: title),
          const SizedBox(height: 12),
          for (var index = 0; index < children.length; index++) ...[
            children[index],
            if (index != children.length - 1) const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _CardHeading extends StatelessWidget {
  const _CardHeading({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.medium),
          ),
          child: Icon(
            icon,
            color: AppColors.primaryStrong,
            size: AppSizes.iconMedium,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            title,
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

class EventReviewRow extends StatelessWidget {
  const EventReviewRow({required this.label, required this.value, super.key});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 4,
          child: Text(
            label,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          flex: 6,
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}
