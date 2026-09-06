import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../chat/chat_screen.dart';
import 'addon_payment_required_screen.dart';
import 'payment_required_screen.dart';
import 'recovery_offers_screen.dart';
import 'review_screen.dart';

class BookingDetailsScreen extends StatelessWidget {
  const BookingDetailsScreen({required this.bookingId, super.key});

  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final repository = FeastaRepository();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Booking Details',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: StreamBuilder<BookingModel?>(
        stream: repository.bookingById(bookingId),
        builder: (context, bookingSnapshot) {
          if (bookingSnapshot.connectionState == ConnectionState.waiting) {
            return const FeastaSkeletonDetailPage(
              padding: EdgeInsets.all(AppSpacing.screen),
              showHero: false,
            );
          }

          if (bookingSnapshot.hasError) {
            return const FeastaApplicationErrorState(
              kind: FeastaErrorKind.load,
              message: 'We couldn\'t load this booking. Please try again.',
            );
          }

          final booking = bookingSnapshot.data;

          if (booking == null) {
            return const FeastaEmptyState(
              icon: Icons.event_busy_outlined,
              title: 'Booking not found',
              message: 'This booking may no longer be available.',
            );
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screen,
              AppSpacing.sm,
              AppSpacing.screen,
              AppSpacing.massive,
            ),
            children: [
              _BookingReferenceHeader(booking: booking),

              const SizedBox(height: AppSpacing.lg),

              if (booking.recoveryStatus == BookingRecoveryStatus.completed &&
                  booking.selectedRecoveryOfferId != null) ...[
                _CustomerRecoveryNoticeCard(booking: booking),
                const SizedBox(height: AppSpacing.md),
              ],

              BookingStatusCard(booking: booking),

              const SizedBox(height: AppSpacing.md),

              _BookingNextActionCard(booking: booking),
              const SizedBox(height: AppSpacing.md),

              BookingTimelineCard(bookingId: booking.id),

              const SizedBox(height: AppSpacing.md),

              EventDetailsCard(booking: booking),

              const SizedBox(height: AppSpacing.md),

              BookingAddOnsCard(booking: booking),

              const SizedBox(height: AppSpacing.md),

              PaymentDetailsCard(booking: booking),

              const SizedBox(height: AppSpacing.xl),

              ActionButtons(booking: booking),
            ],
          );
        },
      ),
    );
  }
}

class _BookingReferenceHeader extends StatelessWidget {
  const _BookingReferenceHeader({required this.booking});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
            child: const Icon(
              Icons.receipt_long_outlined,
              color: AppColors.primaryStrong,
              size: AppSizes.iconLarge,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Booking reference',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                SelectableText(
                  booking.bookingCode,
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
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

class BookingStatusCard extends StatelessWidget {
  const BookingStatusCard({required this.booking, super.key});

  final BookingModel booking;

  String get statusLabel {
    switch (booking.status) {
      case BookingStatus.pending:
        return 'Pending Review';

      case BookingStatus.accepted:
        return 'Accepted';

      case BookingStatus.waitingPayment:
        return 'Payment Required';

      case BookingStatus.paymentProcessing:
        return 'Processing Payment';

      case BookingStatus.confirmed:
        return 'Confirmed';

      case BookingStatus.inProgress:
        return 'In Progress';

      case BookingStatus.completed:
        return 'Completed';

      case BookingStatus.cancelled:
        return 'Cancelled';

      case BookingStatus.rejected:
        return 'Rejected';

      case BookingStatus.expired:
        return 'Expired';

      default:
        return booking.status;
    }
  }

  String get statusMessage {
    switch (booking.status) {
      case BookingStatus.pending:
        return 'Your booking request is waiting for the provider to review it.';

      case BookingStatus.accepted:
        return 'The provider accepted your booking request.';

      case BookingStatus.waitingPayment:
        return 'Your booking was accepted. Complete the required down payment to confirm it.';

      case BookingStatus.paymentProcessing:
        return 'Your payment is currently being processed.';

      case BookingStatus.confirmed:
        return 'Your booking is confirmed and reserved with the provider.';

      case BookingStatus.inProgress:
        return 'Your event or service is currently in progress.';

      case BookingStatus.completed:
        return 'This booking has been completed.';

      case BookingStatus.cancelled:
        return 'This booking has been cancelled.';

      case BookingStatus.rejected:
        return 'The provider was unable to accept this booking request.';

      case BookingStatus.expired:
        return 'This booking request has expired.';

      default:
        return 'Your booking status has been updated.';
    }
  }

  IconData get statusIcon {
    switch (booking.status) {
      case BookingStatus.pending:
        return Icons.schedule_rounded;

      case BookingStatus.accepted:
        return Icons.thumb_up_alt_outlined;

      case BookingStatus.waitingPayment:
        return Icons.account_balance_wallet_outlined;

      case BookingStatus.paymentProcessing:
        return Icons.sync_rounded;

      case BookingStatus.confirmed:
        return Icons.verified_rounded;

      case BookingStatus.inProgress:
        return Icons.celebration_outlined;

      case BookingStatus.completed:
        return Icons.check_circle_outline_rounded;

      case BookingStatus.cancelled:
      case BookingStatus.rejected:
      case BookingStatus.expired:
        return Icons.cancel_outlined;

      default:
        return Icons.info_outline_rounded;
    }
  }

  Color get foregroundColor {
    switch (booking.status) {
      case BookingStatus.confirmed:
      case BookingStatus.completed:
        return AppColors.success;

      case BookingStatus.cancelled:
      case BookingStatus.rejected:
      case BookingStatus.expired:
        return AppColors.error;

      case BookingStatus.pending:
      case BookingStatus.accepted:
      case BookingStatus.waitingPayment:
      case BookingStatus.paymentProcessing:
      case BookingStatus.inProgress:
        return AppColors.primaryStrong;

      default:
        return AppColors.secondaryTextAccessible;
    }
  }

  Color get backgroundColor {
    switch (booking.status) {
      case BookingStatus.confirmed:
      case BookingStatus.completed:
        return AppColors.successSubtle;

      case BookingStatus.cancelled:
      case BookingStatus.rejected:
      case BookingStatus.expired:
        return AppColors.errorSubtle;

      default:
        return AppColors.primarySubtle;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.card),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
            child: Icon(
              statusIcon,
              color: foregroundColor,
              size: AppSizes.iconLarge,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  statusLabel,
                  style: AppTypography.sectionTitle.copyWith(
                    color: foregroundColor,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  statusMessage,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.mainText,
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

class _BookingNextActionCard extends StatelessWidget {
  const _BookingNextActionCard({required this.booking});

  final BookingModel booking;

  String _formatDeadline(DateTime value) {
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

    final hour = value.hour % 12 == 0 ? 12 : value.hour % 12;
    final minute = value.minute.toString().padLeft(2, '0');
    final period = value.hour >= 12 ? 'PM' : 'AM';

    return '${months[value.month - 1]} ${value.day}, ${value.year} '
        'at $hour:$minute $period';
  }

  _BookingNextStep get _nextStep {
    if (booking.cancellationStatus == 'requested') {
      return const _BookingNextStep(
        icon: Icons.hourglass_top_rounded,
        title: 'Cancellation request pending',
        message:
            'Your cancellation request was sent to the provider. '
            'Your booking remains active until the provider reviews it.',
        accent: AppColors.primaryStrong,
        background: AppColors.primarySubtle,
      );
    }

    if (booking.recoveryStatus == BookingRecoveryStatus.offerReceived) {
      return const _BookingNextStep(
        icon: Icons.replay_circle_filled_rounded,
        title: 'Recovery offers are available',
        message:
            'Another qualified caterer has offered to handle your event. '
            'Review the available recovery offers before choosing a provider.',
        accent: AppColors.primaryStrong,
        background: AppColors.primarySubtle,
      );
    }

    if (booking.recoveryStatus == BookingRecoveryStatus.open) {
      return const _BookingNextStep(
        icon: Icons.search_rounded,
        title: 'FEASTA recovery is in progress',
        message:
            'Your original provider could not accept the booking. '
            'Qualified caterers can now send recovery offers for your event.',
        accent: AppColors.primaryStrong,
        background: AppColors.primarySubtle,
      );
    }

    switch (booking.status) {
      case BookingStatus.pending:
        return _BookingNextStep(
          icon: Icons.schedule_rounded,
          title: 'Waiting for ${booking.providerBusinessName}',
          message:
              'The provider is reviewing your booking request. '
              'No payment is required until the booking is accepted.',
          accent: AppColors.primaryStrong,
          background: AppColors.primarySubtle,
        );

      case BookingStatus.accepted:
        return const _BookingNextStep(
          icon: Icons.thumb_up_alt_outlined,
          title: 'Provider accepted your request',
          message:
              'Your booking was accepted. Wait for the booking to move to '
              'payment required before paying the down payment.',
          accent: AppColors.primaryStrong,
          background: AppColors.primarySubtle,
        );

      case BookingStatus.waitingPayment:
        final deadline = booking.paymentDeadline;

        return _BookingNextStep(
          icon: Icons.account_balance_wallet_outlined,
          title: 'Complete your down payment',
          message: deadline == null
              ? 'Payment is now required to confirm and reserve your booking.'
              : 'Payment is now required to confirm your booking. '
                    'Complete it by ${_formatDeadline(deadline)}.',
          accent: AppColors.primaryStrong,
          background: AppColors.primarySubtle,
        );

      case BookingStatus.paymentProcessing:
        return const _BookingNextStep(
          icon: Icons.sync_rounded,
          title: 'Payment is being verified',
          message:
              'Your payment is processing. You do not need to submit another '
              'payment while FEASTA waits for confirmation.',
          accent: AppColors.primaryStrong,
          background: AppColors.primarySubtle,
        );

      case BookingStatus.confirmed:
        return _BookingNextStep(
          icon: Icons.verified_rounded,
          title: 'Your booking is confirmed',
          message:
              'Your event is reserved with ${booking.providerBusinessName}. '
              'Use Messages if you need to coordinate final event details.',
          accent: AppColors.success,
          background: AppColors.successSubtle,
        );

      case BookingStatus.inProgress:
        return const _BookingNextStep(
          icon: Icons.celebration_outlined,
          title: 'Your event is in progress',
          message:
              'The booked service is currently underway. '
              'The provider will mark the booking completed when finished.',
          accent: AppColors.primaryStrong,
          background: AppColors.primarySubtle,
        );

      case BookingStatus.completed:
        return const _BookingNextStep(
          icon: Icons.star_outline_rounded,
          title: 'Share your experience',
          message:
              'This booking is complete. You can now leave a review for the '
              'provider from the booking actions below.',
          accent: AppColors.success,
          background: AppColors.successSubtle,
        );

      case BookingStatus.rejected:
        final reason = booking.rejectedReason?.trim();

        return _BookingNextStep(
          icon: Icons.cancel_outlined,
          title: 'Booking request was rejected',
          message: reason == null || reason.isEmpty
              ? 'The provider could not accept this booking request.'
              : 'Provider reason: $reason',
          accent: AppColors.error,
          background: AppColors.errorSubtle,
        );

      case BookingStatus.cancelled:
        return const _BookingNextStep(
          icon: Icons.event_busy_outlined,
          title: 'No further booking action is required',
          message:
              'This booking has been cancelled. Check the booking timeline '
              'for the recorded cancellation details.',
          accent: AppColors.error,
          background: AppColors.errorSubtle,
        );

      case BookingStatus.expired:
        return const _BookingNextStep(
          icon: Icons.timer_off_outlined,
          title: 'This booking has expired',
          message:
              'The booking can no longer continue in its current state. '
              'Create a new booking if you still need the service.',
          accent: AppColors.error,
          background: AppColors.errorSubtle,
        );

      default:
        return const _BookingNextStep(
          icon: Icons.info_outline_rounded,
          title: 'Check your booking status',
          message:
              'Your booking has been updated. Review the timeline below for '
              'the latest details.',
          accent: AppColors.secondaryTextAccessible,
          background: AppColors.surfaceMuted,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final step = _nextStep;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.card),
      decoration: BoxDecoration(
        color: step.background,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'What happens next?',
            style: AppTypography.caption.copyWith(
              color: AppColors.secondaryTextAccessible,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  step.icon,
                  color: step.accent,
                  size: AppSizes.iconMedium,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      step.title,
                      style: AppTypography.cardTitle.copyWith(
                        color: step.accent,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      step.message,
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.mainText,
                        height: 1.45,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BookingNextStep {
  const _BookingNextStep({
    required this.icon,
    required this.title,
    required this.message,
    required this.accent,
    required this.background,
  });

  final IconData icon;
  final String title;
  final String message;
  final Color accent;
  final Color background;
}

class BookingTimelineCard extends StatelessWidget {
  const BookingTimelineCard({required this.bookingId, super.key});

  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final repository = FeastaRepository();

    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: repository.bookingTimelines(bookingId),
        builder: (context, snapshot) {
          final timelines = snapshot.data?.docs ?? [];

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _CardHeading(
                icon: Icons.timeline_rounded,
                title: 'Booking Timeline',
              ),

              const SizedBox(height: AppSpacing.lg),

              if (snapshot.connectionState == ConnectionState.waiting)
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FeastaSkeletonBox(width: 180, height: 14, radius: 8),
                    SizedBox(height: AppSpacing.sm),
                    FeastaSkeletonBox(height: 12, radius: 8),
                    SizedBox(height: AppSpacing.sm),
                    FeastaSkeletonBox(width: 130, height: 12, radius: 8),
                  ],
                )
              else if (snapshot.hasError)
                Text(
                  'Timeline could not be loaded.',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                )
              else if (timelines.isEmpty)
                Text(
                  'No timeline updates yet.',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                )
              else
                for (var index = 0; index < timelines.length; index++)
                  TimelineItem(
                    data: timelines[index].data(),
                    showConnector: index != timelines.length - 1,
                  ),
            ],
          );
        },
      ),
    );
  }
}

class TimelineItem extends StatelessWidget {
  const TimelineItem({
    required this.data,
    this.showConnector = false,
    super.key,
  });

  final Map<String, dynamic> data;
  final bool showConnector;

  String get status => data['status']?.toString().trim() ?? '';

  String get type => data['type']?.toString().trim() ?? '';

  dynamic get createdAt => data['createdAt'];

  String get title {
    final storedTitle = data['title']?.toString().trim();
    if (storedTitle != null && storedTitle.isNotEmpty) {
      return storedTitle;
    }

    switch (type) {
      case 'booking_submitted':
      case 'submitted':
        return 'Booking Submitted';
      case 'provider_accepted':
      case 'accepted':
        return 'Provider Accepted Booking';
      case 'provider_rejected':
      case 'rejected':
        return 'Provider Rejected Booking';
      case 'payment_confirmed':
      case 'paid':
        return 'Payment Confirmed';
      case 'payment_processing':
        return 'Payment Processing';
      case 'payment_failed':
        return 'Payment Failed';
      case 'payment_expired':
        return 'Payment Expired';
      case 'payment_refunded':
        return 'Payment Refunded';
      case 'in_progress':
        return 'Service Started';
      case 'completed':
        return 'Booking Completed';
      case 'cancelled':
        return 'Booking Cancelled';
      default:
        return 'Booking Update';
    }
  }

  String get description {
    final storedDescription = data['description']?.toString().trim();
    if (storedDescription != null && storedDescription.isNotEmpty) {
      return storedDescription;
    }

    final storedMessage = data['message']?.toString().trim();
    if (storedMessage != null && storedMessage.isNotEmpty) {
      return storedMessage;
    }

    switch (type) {
      case 'booking_submitted':
      case 'submitted':
        return 'Your booking request was submitted for provider review.';
      case 'provider_accepted':
      case 'accepted':
        return 'The provider accepted your booking request.';
      case 'provider_rejected':
      case 'rejected':
        return 'The provider was unable to accept your booking request.';
      case 'payment_confirmed':
      case 'paid':
        return 'Your down payment was successfully confirmed.';
      case 'payment_processing':
        return 'Your payment is being verified.';
      case 'payment_failed':
        return 'The payment could not be completed.';
      case 'payment_expired':
        return 'The payment window expired before confirmation.';
      case 'payment_refunded':
        return 'A refund update was recorded for this booking.';
      case 'in_progress':
        return 'The provider started delivering the booked service.';
      case 'completed':
        return 'The booked service was marked as completed.';
      case 'cancelled':
        return 'The booking was cancelled.';
      default:
        return '';
    }
  }

  String get formattedDate {
    final value = createdAt;
    if (value is! Timestamp) {
      return '';
    }

    final date = value.toDate();
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    final minute = date.minute.toString().padLeft(2, '0');
    final period = date.hour >= 12 ? 'PM' : 'AM';

    return '${date.month}/${date.day}/${date.year} '
        '$hour:$minute $period';
  }

  bool get isCompleted {
    const progressedStatuses = <String>{
      'pending',
      'pending_provider_approval',
      'accepted',
      'waiting_payment',
      'waiting_for_down_payment',
      'payment_processing',
      'confirmed',
      'in_progress',
      'completed',
    };

    const progressedTypes = <String>{
      'booking_submitted',
      'submitted',
      'provider_accepted',
      'accepted',
      'payment_confirmed',
      'paid',
      'payment_processing',
      'in_progress',
      'completed',
    };

    return progressedStatuses.contains(status) ||
        progressedTypes.contains(type);
  }

  bool get isFailure {
    const failureStatuses = <String>{'rejected', 'cancelled', 'expired'};
    const failureTypes = <String>{
      'provider_rejected',
      'rejected',
      'payment_failed',
      'payment_expired',
      'cancelled',
    };

    return failureStatuses.contains(status) || failureTypes.contains(type);
  }

  @override
  Widget build(BuildContext context) {
    final markerColor = isFailure
        ? AppColors.error
        : isCompleted
        ? AppColors.success
        : AppColors.secondaryTextAccessible;

    final markerBackground = isFailure
        ? AppColors.errorSubtle
        : isCompleted
        ? AppColors.successSubtle
        : AppColors.surfaceMuted;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 38,
            child: Column(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: markerBackground,
                    shape: BoxShape.circle,
                    border: Border.all(color: markerColor),
                  ),
                  child: Icon(
                    isFailure
                        ? Icons.close_rounded
                        : isCompleted
                        ? Icons.check_rounded
                        : Icons.circle_outlined,
                    color: markerColor,
                    size: 17,
                  ),
                ),
                if (showConnector)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 5),
                      color: AppColors.border,
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
                  Text(
                    title,
                    style: AppTypography.label.copyWith(
                      color: AppColors.mainText,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  if (description.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      description,
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        height: 1.4,
                      ),
                    ),
                  ],
                  if (formattedDate.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      formattedDate,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
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

class EventDetailsCard extends StatelessWidget {
  const EventDetailsCard({required this.booking, super.key});

  final BookingModel booking;

  String get formattedDate {
    final date = booking.eventDate;

    if (date == null) {
      return 'No date';
    }

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

    return '${months[date.month - 1]} '
        '${date.day}, ${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _CardHeading(
            icon: Icons.event_outlined,
            title: 'Event Details',
          ),

          const SizedBox(height: AppSpacing.lg),

          _DetailRow(
            icon: Icons.storefront_outlined,
            label: 'Provider',
            value: booking.providerBusinessName,
          ),

          const _CardDivider(),

          _DetailRow(
            icon: Icons.inventory_2_outlined,
            label: 'Package',
            value: booking.packageName,
          ),

          const _CardDivider(),

          _DetailRow(
            icon: Icons.celebration_outlined,
            label: 'Event type',
            value: booking.eventType,
          ),

          const _CardDivider(),

          _DetailRow(
            icon: Icons.calendar_today_outlined,
            label: 'Date',
            value: formattedDate,
          ),

          const _CardDivider(),

          _DetailRow(
            icon: Icons.schedule_rounded,
            label: 'Time',
            value: '${booking.eventTime} – ${booking.eventEndTime}',
          ),

          const _CardDivider(),

          _DetailRow(
            icon: Icons.groups_outlined,
            label: 'Guests',
            value: '${booking.guestCount}',
          ),

          const _CardDivider(),

          _DetailRow(
            icon: Icons.location_city_outlined,
            label: 'Location',
            value: booking.eventLocation,
          ),

          const _CardDivider(),

          _DetailRow(
            icon: Icons.location_on_outlined,
            label: 'Address',
            value: booking.eventAddress,
          ),
        ],
      ),
    );
  }
}

class PaymentDetailsCard extends StatelessWidget {
  const PaymentDetailsCard({required this.booking, super.key});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _CardHeading(
            icon: Icons.payments_outlined,
            title: 'Payment Details',
          ),

          const SizedBox(height: AppSpacing.lg),

          _PriceRow(label: 'Package price', amount: booking.packagePrice),

          const SizedBox(height: AppSpacing.sm),

          _PriceRow(label: 'Add-ons', amount: booking.addOnsTotal),

          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: Divider(height: 1, color: AppColors.border),
          ),

          _PriceRow(
            label: 'Total amount',
            amount: booking.totalAmount,
            emphasized: true,
          ),

          const SizedBox(height: AppSpacing.md),

          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(AppRadius.large),
            ),
            child: Column(
              children: [
                _PriceRow(
                  label: 'Down payment',
                  amount: booking.downPaymentAmount,
                  accent: true,
                ),

                const SizedBox(height: AppSpacing.sm),

                _PriceRow(
                  label: 'Remaining balance',
                  amount: booking.remainingBalance,
                ),
              ],
            ),
          ),

          const SizedBox(height: AppSpacing.md),

          Row(
            children: [
              Expanded(
                child: Text(
                  'Payment status',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              _PaymentStatusBadge(status: booking.paymentStatus),
            ],
          ),
        ],
      ),
    );
  }
}

class BookingAddOnsCard extends StatelessWidget {
  const BookingAddOnsCard({required this.booking, super.key});

  final BookingModel booking;

  List<Map<String, dynamic>> get cateringProviderAddOns {
    return booking.selectedAddOns
        .where((addon) => addon['source'] == 'catering_provider')
        .toList();
  }

  List<Map<String, dynamic>> get marketplaceAddOns {
    return booking.selectedAddOns
        .where((addon) => addon['source'] == 'feasta_addon_provider')
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final repository = FeastaRepository();

    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _CardHeading(
            icon: Icons.add_circle_outline_rounded,
            title: 'Add-ons',
          ),

          const SizedBox(height: AppSpacing.lg),

          _AddOnGroup(
            title: 'Caterer add-ons',
            addOns: cateringProviderAddOns,
            emptyText: 'No caterer add-ons selected.',
          ),

          const SizedBox(height: AppSpacing.lg),

          StreamBuilder<List<AddonRequestModel>>(
            stream: repository.addonRequestsByBooking(booking.id),
            builder: (context, snapshot) {
              return _MarketplaceAddOnGroup(
                booking: booking,
                addOns: marketplaceAddOns,
                requests: snapshot.data ?? const <AddonRequestModel>[],
              );
            },
          ),

          if (booking.willArrangeOwnAddOns) ...[
            const SizedBox(height: AppSpacing.lg),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Customer-arranged add-ons',
              style: AppTypography.cardTitle.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              booking.customerArrangedAddOnsNote.isEmpty
                  ? 'You will arrange your own add-ons.'
                  : booking.customerArrangedAddOnsNote,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
                height: 1.4,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AddOnGroup extends StatelessWidget {
  const _AddOnGroup({
    required this.title,
    required this.addOns,
    required this.emptyText,
  });

  final String title;
  final List<Map<String, dynamic>> addOns;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.cardTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),

        const SizedBox(height: AppSpacing.sm),

        if (addOns.isEmpty)
          Text(
            emptyText,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          )
        else
          for (var index = 0; index < addOns.length; index++) ...[
            _SimpleAddOnRow(addOn: addOns[index]),
            if (index != addOns.length - 1)
              const Divider(height: AppSpacing.lg, color: AppColors.border),
          ],
      ],
    );
  }
}

class _SimpleAddOnRow extends StatelessWidget {
  const _SimpleAddOnRow({required this.addOn});

  final Map<String, dynamic> addOn;

  @override
  Widget build(BuildContext context) {
    final name = addOn['name']?.toString() ?? 'Add-on';

    final providerBusinessName =
        addOn['providerBusinessName']?.toString() ?? '';

    final rawPrice = addOn['price'];

    final price = rawPrice is num ? rawPrice.toDouble() : 0.0;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.medium),
          ),
          child: const Icon(
            Icons.add_rounded,
            color: AppColors.primaryStrong,
            size: AppSizes.iconSmall,
          ),
        ),

        const SizedBox(width: AppSpacing.sm),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (providerBusinessName.trim().isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  providerBusinessName,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ],
          ),
        ),

        const SizedBox(width: AppSpacing.sm),

        FeastaPriceText(
          amount: price,
          decimalDigits: 0,
          semanticLabel: '$name add-on price',
          style: AppTypography.label.copyWith(
            color: AppColors.primaryStrong,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _MarketplaceAddOnGroup extends StatelessWidget {
  const _MarketplaceAddOnGroup({
    required this.booking,
    required this.addOns,
    required this.requests,
  });

  final BookingModel booking;

  final List<Map<String, dynamic>> addOns;

  final List<AddonRequestModel> requests;

  AddonRequestModel? requestForAddon(Map<String, dynamic> addon) {
    final addonId = addon['addonId']?.toString() ?? '';

    for (final request in requests) {
      if (request.addonId == addonId) {
        return request;
      }
    }

    return null;
  }

  String statusLabel(String status) {
    switch (status) {
      case AddonRequestStatus.pending:
        return 'Pending';

      case AddonRequestStatus.accepted:
        return 'Accepted';

      case AddonRequestStatus.rejected:
        return 'Rejected';

      case AddonRequestStatus.completed:
        return 'Completed';

      case AddonRequestStatus.cancelled:
        return 'Cancelled';

      default:
        return status;
    }
  }

  String paymentStatusLabel(String status) {
    switch (status) {
      case 'unpaid':
        return 'Unpaid';

      case 'waiting_payment':
        return 'Waiting for Payment';

      case 'paid':
        return 'Paid';

      case 'cancelled':
        return 'Cancelled';

      case 'refund_review':
        return 'Refund Review';

      case 'refunded':
        return 'Refunded';

      default:
        return status;
    }
  }

  Color statusColor(String status) {
    switch (status) {
      case AddonRequestStatus.accepted:
      case AddonRequestStatus.completed:
        return AppColors.success;

      case AddonRequestStatus.rejected:
      case AddonRequestStatus.cancelled:
        return AppColors.error;

      default:
        return AppColors.primaryStrong;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'FEASTA Marketplace',
          style: AppTypography.cardTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),

        const SizedBox(height: AppSpacing.sm),

        if (addOns.isEmpty)
          Text(
            'No marketplace add-ons selected.',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          )
        else
          for (var index = 0; index < addOns.length; index++) ...[
            _MarketplaceAddOnCard(
              booking: booking,
              addOn: addOns[index],
              request: requestForAddon(addOns[index]),
              statusLabel: statusLabel,
              paymentStatusLabel: paymentStatusLabel,
              statusColor: statusColor,
            ),
            if (index != addOns.length - 1)
              const SizedBox(height: AppSpacing.sm),
          ],
      ],
    );
  }
}

class _MarketplaceAddOnCard extends StatelessWidget {
  const _MarketplaceAddOnCard({
    required this.booking,
    required this.addOn,
    required this.request,
    required this.statusLabel,
    required this.paymentStatusLabel,
    required this.statusColor,
  });

  final BookingModel booking;

  final Map<String, dynamic> addOn;

  final AddonRequestModel? request;

  final String Function(String) statusLabel;

  final String Function(String) paymentStatusLabel;

  final Color Function(String) statusColor;

  @override
  Widget build(BuildContext context) {
    final name = addOn['name']?.toString() ?? 'Add-on';

    final providerBusinessName =
        addOn['providerBusinessName']?.toString() ?? '';

    final rawPrice = addOn['price'];

    final price = rawPrice is num ? rawPrice.toDouble() : 0.0;

    final status = request?.status ?? AddonRequestStatus.pending;

    final paymentStatus = request?.paymentStatus ?? 'unpaid';

    final linkStatus = request?.linkStatus ?? AddonLinkStatus.active;

    final canPayAddon =
        request != null &&
        booking.status == BookingStatus.confirmed &&
        request!.status == AddonRequestStatus.accepted &&
        request!.paymentStatus == 'waiting_payment' &&
        linkStatus != AddonLinkStatus.awaitingCustomerRecoverySelection &&
        linkStatus != AddonLinkStatus.cancelledDueToMainBookingFailed;

    final color = statusColor(status);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: AppTypography.label.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (providerBusinessName.trim().isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        providerBusinessName,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              const SizedBox(width: AppSpacing.sm),

              FeastaPriceText(
                amount: price,
                decimalDigits: 0,
                semanticLabel: '$name add-on price',
                style: AppTypography.label.copyWith(
                  color: AppColors.primaryStrong,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),

          const SizedBox(height: AppSpacing.sm),

          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              _CompactStatusBadge(label: statusLabel(status), color: color),
              _CompactStatusBadge(
                label: 'Payment: ${paymentStatusLabel(paymentStatus)}',
                color: paymentStatus == 'paid'
                    ? AppColors.success
                    : AppColors.secondaryTextAccessible,
              ),
            ],
          ),

          if (request?.rejectedReason != null &&
              request!.rejectedReason!.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.sm),
              decoration: BoxDecoration(
                color: AppColors.errorSubtle,
                borderRadius: BorderRadius.circular(AppRadius.medium),
              ),
              child: Text(
                'Reason: ${request!.rejectedReason}',
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.error,
                  height: 1.4,
                ),
              ),
            ),
          ],

          if (canPayAddon) ...[
            const SizedBox(height: AppSpacing.md),
            FeastaPrimaryButton(
              label: 'Pay Add-on Service',
              icon: const Icon(Icons.payment_rounded),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => AddonPaymentRequiredScreen(
                      booking: booking,
                      addonRequest: request!,
                    ),
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class ActionButtons extends StatelessWidget {
  const ActionButtons({required this.booking, super.key});

  final BookingModel booking;

  Future<void> _cancelBooking(BuildContext context) async {
    final reasonController = TextEditingController();

    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return _ReasonDialog(
          title: 'Cancel Booking',
          message: 'Tell the provider why you need to cancel this booking.',
          controller: reasonController,
          confirmLabel: 'Submit Cancellation',
        );
      },
    );

    reasonController.dispose();

    if (reason == null || reason.trim().isEmpty) {
      return;
    }

    try {
      await FeastaRepository().cancelOrRequestBookingCancellation(
        booking: booking,
        reason: reason.trim(),
      );

      if (!context.mounted) {
        return;
      }

      final isPaidBooking =
          booking.status == BookingStatus.confirmed ||
          booking.paymentStatus == PaymentStatus.partiallyPaid ||
          booking.paymentStatus == PaymentStatus.paid;

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              isPaidBooking
                  ? 'Cancellation request submitted to provider.'
                  : 'Booking cancelled successfully.',
            ),
          ),
        );
    } catch (error) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceAll('Exception: ', '')),
          ),
        );
    }
  }

  Future<void> _cancelRecoveryRequest(BuildContext context) async {
    final reasonController = TextEditingController();

    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return _ReasonDialog(
          title: 'Cancel Recovery Request',
          message: 'Tell us why you want to stop the recovery process.',
          controller: reasonController,
          confirmLabel: 'Cancel Recovery',
        );
      },
    );

    reasonController.dispose();

    if (reason == null || reason.trim().isEmpty) {
      return;
    }

    try {
      await FeastaRepository().cancelRecoveryRequest(
        booking: booking,
        reason: reason.trim(),
      );

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('Recovery request cancelled.')),
        );
    } catch (error) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceAll('Exception: ', '')),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final canCancel =
        (booking.status == BookingStatus.pending ||
            booking.status == BookingStatus.waitingPayment ||
            booking.status == BookingStatus.confirmed) &&
        booking.cancellationStatus != 'requested' &&
        booking.recoveryStatus != BookingRecoveryStatus.open &&
        booking.recoveryStatus != BookingRecoveryStatus.offerReceived;

    final hasRecovery =
        booking.recoveryStatus == BookingRecoveryStatus.open ||
        booking.recoveryStatus == BookingRecoveryStatus.offerReceived;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Booking actions',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),

        const SizedBox(height: AppSpacing.md),

        FeastaSecondaryButton(
          label: 'Chat with Provider',
          icon: const Icon(Icons.chat_bubble_outline_rounded),
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => ChatScreen(
                  booking: booking,
                  currentRole: UserRoles.customer,
                ),
              ),
            );
          },
        ),

        if (booking.status == BookingStatus.waitingPayment) ...[
          const SizedBox(height: AppSpacing.sm),
          FeastaPrimaryButton(
            label: 'Pay Down Payment',
            icon: const Icon(Icons.payment_rounded),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PaymentRequiredScreen(booking: booking),
                ),
              );
            },
          ),
        ],

        if (booking.status == BookingStatus.completed) ...[
          const SizedBox(height: AppSpacing.sm),
          FeastaPrimaryButton(
            label: 'Write Review',
            icon: const Icon(Icons.star_outline_rounded),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ReviewScreen(booking: booking),
                ),
              );
            },
          ),
        ],

        if (hasRecovery) ...[
          const SizedBox(height: AppSpacing.sm),
          FeastaPrimaryButton(
            label: 'View Recovery Offers',
            icon: const Icon(Icons.replay_circle_filled_rounded),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => RecoveryOffersScreen(booking: booking),
                ),
              );
            },
          ),

          const SizedBox(height: AppSpacing.sm),

          _DangerOutlineButton(
            label: 'Cancel Recovery Request',
            icon: Icons.cancel_outlined,
            onPressed: () {
              _cancelRecoveryRequest(context);
            },
          ),
        ],

        if (canCancel) ...[
          const SizedBox(height: AppSpacing.sm),
          _DangerOutlineButton(
            label: 'Cancel Booking',
            icon: Icons.event_busy_outlined,
            onPressed: () {
              _cancelBooking(context);
            },
          ),
        ],
      ],
    );
  }
}

class _ReasonDialog extends StatelessWidget {
  const _ReasonDialog({
    required this.title,
    required this.message,
    required this.controller,
    required this.confirmLabel,
  });

  final String title;
  final String message;
  final TextEditingController controller;
  final String confirmLabel;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.surface,
      title: Text(
        title,
        style: AppTypography.sectionTitle.copyWith(
          color: AppColors.mainText,
          fontWeight: FontWeight.w900,
        ),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            message,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: controller,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: 'Enter your reason',
              filled: true,
              fillColor: AppColors.surfaceMuted,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.large),
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () {
            Navigator.pop(context);
          },
          child: Text(
            'Close',
            style: AppTypography.label.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ),
        FilledButton(
          onPressed: () {
            Navigator.pop(context, controller.text.trim());
          },
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.error,
            foregroundColor: Colors.white,
          ),
          child: Text(
            confirmLabel,
            style: AppTypography.label.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _DangerOutlineButton extends StatelessWidget {
  const _DangerOutlineButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: AppSizes.buttonHeight,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon),
        label: Text(
          label,
          style: AppTypography.button.copyWith(fontWeight: FontWeight.w800),
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.error,
          side: const BorderSide(color: AppColors.error),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.large),
          ),
        ),
      ),
    );
  }
}

class _CompactStatusBadge extends StatelessWidget {
  const _CompactStatusBadge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        label,
        style: AppTypography.caption.copyWith(
          color: color,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _PaymentStatusBadge extends StatelessWidget {
  const _PaymentStatusBadge({required this.status});

  final String status;

  String get label {
    switch (status) {
      case 'pending':
        return 'Pending';

      case 'processing':
        return 'Processing';

      case 'partially_paid':
        return 'Partially Paid';

      case 'paid':
        return 'Paid';

      case 'failed':
        return 'Failed';

      case 'expired':
        return 'Expired';

      case 'cancelled':
        return 'Cancelled';

      case 'partially_refunded':
        return 'Partially Refunded';

      case 'refunded':
        return 'Refunded';

      default:
        return status;
    }
  }

  Color get color {
    switch (status) {
      case 'paid':
        return AppColors.success;

      case 'failed':
      case 'expired':
      case 'cancelled':
        return AppColors.error;

      default:
        return AppColors.primaryStrong;
    }
  }

  @override
  Widget build(BuildContext context) {
    return _CompactStatusBadge(label: label, color: color);
  }
}

class _CustomerRecoveryNoticeCard extends StatelessWidget {
  const _CustomerRecoveryNoticeCard({required this.booking});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.card),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.replay_circle_filled_rounded,
              color: AppColors.primaryStrong,
              size: AppSizes.iconLarge,
            ),
          ),

          const SizedBox(width: AppSpacing.md),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Recovered Booking',
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                const SizedBox(height: AppSpacing.xs),

                Text(
                  'This booking continued through FEASTA’s recovery flow. '
                  'Your current catering provider is '
                  '${booking.providerBusinessName}.',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.45,
                  ),
                ),

                if (booking.status == BookingStatus.waitingPayment) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Complete the down payment to confirm this recovered booking.',
                    style: AppTypography.label.copyWith(
                      color: AppColors.primaryStrong,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ],
            ),
          ),
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
          width: 42,
          height: 42,
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

class _CardDivider extends StatelessWidget {
  const _CardDivider();

  @override
  Widget build(BuildContext context) {
    return const Divider(height: AppSpacing.lg, color: AppColors.border);
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          icon,
          color: AppColors.secondaryTextAccessible,
          size: AppSizes.iconMedium,
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          flex: 4,
          child: Text(
            label,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          flex: 6,
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    required this.label,
    required this.amount,
    this.emphasized = false,
    this.accent = false,
  });

  final String label;
  final double amount;
  final bool emphasized;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style:
                (emphasized ? AppTypography.cardTitle : AppTypography.bodySmall)
                    .copyWith(
                      color: accent
                          ? AppColors.primaryStrong
                          : AppColors.mainText,
                      fontWeight: emphasized || accent
                          ? FontWeight.w900
                          : FontWeight.w600,
                    ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        FeastaPriceText(
          amount: amount,
          decimalDigits: 0,
          semanticLabel: label,
          style:
              (emphasized ? AppTypography.cardTitle : AppTypography.bodySmall)
                  .copyWith(
                    color: emphasized || accent
                        ? AppColors.primaryStrong
                        : AppColors.mainText,
                    fontWeight: emphasized || accent
                        ? FontWeight.w900
                        : FontWeight.w700,
                  ),
        ),
      ],
    );
  }
}
