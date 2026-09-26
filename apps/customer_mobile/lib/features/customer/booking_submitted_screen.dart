import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import 'customer_main_screen.dart';

class BookingSubmittedScreen extends StatelessWidget {
  const BookingSubmittedScreen({
    required this.bookingId,
    required this.providerName,
    super.key,
  });

  final String bookingId;
  final String providerName;

  void _openBookings(BuildContext context) {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => const CustomerMainScreen(initialIndex: 2),
      ),
      (_) => false,
    );
  }

  void _backToHome(BuildContext context) {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const CustomerMainScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.xl,
            AppSpacing.screen,
            AppSpacing.xl,
          ),
          child: Column(
            children: [
              const SizedBox(height: AppSpacing.lg),

              const _SubmittedIllustration(),

              const SizedBox(height: AppSpacing.xl),

              Text(
                'Booking request sent',
                textAlign: TextAlign.center,
                style: AppTypography.pageTitle.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: AppSpacing.sm),

              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                child: Text(
                  'Your request has been sent to $providerName. '
                  'They will review your event details before accepting the booking.',
                  textAlign: TextAlign.center,
                  style: AppTypography.body.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.55,
                  ),
                ),
              ),

              const SizedBox(height: AppSpacing.xl),

              _BookingStatusCard(bookingId: bookingId),

              const SizedBox(height: AppSpacing.xl),

              const Align(
                alignment: Alignment.centerLeft,
                child: _SectionHeading(
                  title: 'What happens next?',
                  subtitle: 'Your booking will move through these steps.',
                ),
              ),

              const SizedBox(height: AppSpacing.md),

              const _BookingProgressCard(),

              const SizedBox(height: AppSpacing.md),

              const _ImportantNotice(),

              const SizedBox(height: AppSpacing.xl),

              FeastaPrimaryButton(
                label: 'View My Bookings',
                icon: const Icon(Icons.calendar_month_rounded),
                onPressed: () {
                  _openBookings(context);
                },
              ),

              const SizedBox(height: AppSpacing.sm),

              FeastaSecondaryButton(
                label: 'Back to Home',
                icon: const Icon(Icons.home_outlined),
                onPressed: () {
                  _backToHome(context);
                },
              ),

              const SizedBox(height: AppSpacing.lg),
            ],
          ),
        ),
      ),
    );
  }
}

class _SubmittedIllustration extends StatelessWidget {
  const _SubmittedIllustration();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Booking request successfully submitted',
      image: true,
      child: ExcludeSemantics(
        child: Stack(
          alignment: Alignment.center,
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 132,
              height: 132,
              decoration: const BoxDecoration(
                color: AppColors.primarySubtle,
                shape: BoxShape.circle,
              ),
            ),

            Container(
              width: 94,
              height: 94,
              decoration: BoxDecoration(
                color: AppColors.surface,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.border),
              ),
              child: const Icon(
                Icons.mark_email_read_rounded,
                color: AppColors.primary,
                size: 46,
              ),
            ),

            Positioned(
              right: 9,
              bottom: 8,
              child: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppColors.success,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.surface, width: 4),
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: Colors.white,
                  size: 21,
                ),
              ),
            ),

            const Positioned(
              top: 7,
              right: 2,
              child: Icon(
                Icons.auto_awesome_rounded,
                size: 21,
                color: AppColors.primary,
              ),
            ),

            const Positioned(
              left: 3,
              bottom: 23,
              child: Icon(
                Icons.auto_awesome_rounded,
                size: 15,
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BookingStatusCard extends StatelessWidget {
  const _BookingStatusCard({required this.bookingId});

  final String bookingId;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.primarySubtle,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: const Icon(
                  Icons.receipt_long_outlined,
                  color: AppColors.primaryStrong,
                  size: AppSizes.iconMedium,
                ),
              ),

              const SizedBox(width: AppSpacing.sm),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Booking request',
                      style: AppTypography.cardTitle.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      'Successfully submitted',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ],
                ),
              ),

              const _PendingStatusBadge(),
            ],
          ),

          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: Divider(height: 1, color: AppColors.border),
          ),

          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  'Booking ID',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Flexible(
                child: SelectableText(
                  bookingId,
                  textAlign: TextAlign.right,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PendingStatusBadge extends StatelessWidget {
  const _PendingStatusBadge();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Booking status pending provider review',
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xs,
          ),
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.schedule_rounded,
                color: AppColors.primaryStrong,
                size: AppSizes.iconSmall,
              ),
              const SizedBox(width: 5),
              Text(
                'Pending',
                style: AppTypography.caption.copyWith(
                  color: AppColors.primaryStrong,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          subtitle,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}

class _BookingProgressCard extends StatelessWidget {
  const _BookingProgressCard();

  @override
  Widget build(BuildContext context) {
    return const FeastaCard(
      padding: EdgeInsets.all(AppSpacing.card),
      child: Column(
        children: [
          _ProgressStep(
            step: 1,
            title: 'Request submitted',
            description: 'Your booking request has been sent to the provider.',
            state: _ProgressStepState.complete,
            showConnector: true,
          ),

          _ProgressStep(
            step: 2,
            title: 'Provider review',
            description:
                'The provider will review your event details and availability.',
            state: _ProgressStepState.current,
            showConnector: true,
          ),

          _ProgressStep(
            step: 3,
            title: 'Pay down payment',
            description:
                'If accepted, you will be asked to complete the required down payment.',
            state: _ProgressStepState.upcoming,
            showConnector: true,
          ),

          _ProgressStep(
            step: 4,
            title: 'Booking confirmed',
            description:
                'Your booking is confirmed after the required payment is completed.',
            state: _ProgressStepState.upcoming,
            showConnector: false,
          ),
        ],
      ),
    );
  }
}

enum _ProgressStepState { complete, current, upcoming }

class _ProgressStep extends StatelessWidget {
  const _ProgressStep({
    required this.step,
    required this.title,
    required this.description,
    required this.state,
    required this.showConnector,
  });

  final int step;
  final String title;
  final String description;
  final _ProgressStepState state;
  final bool showConnector;

  @override
  Widget build(BuildContext context) {
    final isComplete = state == _ProgressStepState.complete;

    final isCurrent = state == _ProgressStepState.current;

    final circleColor = isComplete
        ? AppColors.success
        : isCurrent
        ? AppColors.primary
        : AppColors.surfaceMuted;

    final iconColor = isComplete || isCurrent
        ? Colors.white
        : AppColors.secondaryTextAccessible;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 42,
            child: Column(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: circleColor,
                    shape: BoxShape.circle,
                    border: !isComplete && !isCurrent
                        ? Border.all(color: AppColors.border)
                        : null,
                  ),
                  child: isComplete
                      ? Icon(Icons.check_rounded, color: iconColor, size: 19)
                      : Text(
                          '$step',
                          style: AppTypography.label.copyWith(
                            color: iconColor,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                ),

                if (showConnector)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 5),
                      color: isComplete ? AppColors.success : AppColors.border,
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
            child: Padding(
              padding: EdgeInsets.only(
                bottom: showConnector ? AppSpacing.lg : 0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: AppTypography.label.copyWith(
                            color: AppColors.mainText,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      if (isCurrent)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.xs,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primarySubtle,
                            borderRadius: BorderRadius.circular(AppRadius.pill),
                          ),
                          child: Text(
                            'Current',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.primaryStrong,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                    ],
                  ),

                  const SizedBox(height: AppSpacing.xxs),

                  Text(
                    description,
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ImportantNotice extends StatelessWidget {
  const _ImportantNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.notifications_none_rounded,
              color: AppColors.primaryStrong,
              size: AppSizes.iconMedium,
            ),
          ),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'We’ll keep you updated',
                  style: AppTypography.label.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                const SizedBox(height: AppSpacing.xxs),

                Text(
                  'Check My Bookings and your notifications for updates '
                  'when the provider accepts, rejects, or responds to your request.',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
