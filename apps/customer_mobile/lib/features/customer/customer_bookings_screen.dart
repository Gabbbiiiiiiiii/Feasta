import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../chat/chat_screen.dart';
import 'booking_details_screen.dart';
import 'payment_required_screen.dart';

class CustomerBookingsScreen extends StatefulWidget {
  const CustomerBookingsScreen({super.key});

  @override
  State<CustomerBookingsScreen> createState() => _CustomerBookingsScreenState();
}

class _CustomerBookingsScreenState extends State<CustomerBookingsScreen> {
  final FeastaRepository repository = FeastaRepository();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const FeastaPageHeader(title: 'My Bookings'),
          Expanded(
            child: StreamBuilder<List<BookingModel>>(
              stream: repository.customerBookings(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const FeastaListSkeleton(
                    itemCount: 5,
                    padding: EdgeInsets.fromLTRB(
                      AppSpacing.screen,
                      AppSpacing.sm,
                      AppSpacing.screen,
                      AppSpacing.xl,
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return Center(
                    child: FeastaApplicationErrorState(
                      kind: FeastaErrorKind.load,
                      message:
                          'We could not load your bookings. Please try again.',
                      onRetry: () {
                        setState(() {});
                      },
                    ),
                  );
                }

                final bookings = snapshot.data ?? const <BookingModel>[];

                if (bookings.isEmpty) {
                  return const _BookingsEmptyState();
                }

                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async {
                    setState(() {});

                    await Future<void>.delayed(
                      const Duration(milliseconds: 500),
                    );
                  },
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screen,
                      AppSpacing.sm,
                      AppSpacing.screen,
                      AppSpacing.massive,
                    ),
                    itemCount: bookings.length + 1,
                    separatorBuilder: (context, index) {
                      return const SizedBox(height: AppSpacing.md);
                    },
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        return _BookingsIntro(bookingCount: bookings.length);
                      }

                      return BookingCard(booking: bookings[index - 1]);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingsIntro extends StatelessWidget {
  const _BookingsIntro({required this.bookingCount});

  final int bookingCount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Your events',
            style: AppTypography.sectionTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            '$bookingCount booking'
            '${bookingCount == 1 ? '' : 's'} in your account',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingsEmptyState extends StatelessWidget {
  const _BookingsEmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        child: FeastaEmptyState(
          icon: Icons.event_note_outlined,
          title: 'No bookings yet',
          message: 'Your catering bookings will appear here.',
        ),
      ),
    );
  }
}

class BookingCard extends StatelessWidget {
  const BookingCard({required this.booking, super.key});

  final BookingModel booking;

  String get statusLabel {
    switch (booking.status) {
      case 'pending':
        return 'Pending Review';

      case 'accepted':
        return 'Accepted';

      case 'waiting_payment':
        return 'Payment Required';

      case 'payment_processing':
        return 'Processing Payment';

      case 'confirmed':
        return 'Confirmed';

      case 'completed':
        return 'Completed';

      case 'cancelled':
        return 'Cancelled';

      case 'rejected':
        return 'Rejected';

      case 'expired':
        return 'Expired';

      default:
        return booking.status;
    }
  }

  FeastaStatusTone get statusTone {
    switch (booking.status) {
      case 'pending':
      case 'waiting_payment':
      case 'payment_processing':
        return FeastaStatusTone.warning;

      case 'accepted':
      case 'confirmed':
        return FeastaStatusTone.success;

      case 'completed':
        return FeastaStatusTone.info;

      case 'cancelled':
      case 'rejected':
      case 'expired':
        return FeastaStatusTone.error;

      default:
        return FeastaStatusTone.neutral;
    }
  }

  String get formattedDate {
    final date = booking.eventDate;

    if (date == null) {
      return 'Date not set';
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

  String get nextStepTitle {
    switch (booking.status) {
      case 'pending':
        return 'Waiting for provider review';

      case 'accepted':
        return 'Provider accepted your request';

      case 'waiting_payment':
        return 'Down payment required';

      case 'payment_processing':
        return 'Payment is processing';

      case 'confirmed':
        return 'Your booking is confirmed';

      case 'completed':
        return 'Event completed';

      case 'cancelled':
        return 'Booking cancelled';

      case 'rejected':
        return 'Provider declined the request';

      case 'expired':
        return 'Booking request expired';

      default:
        return 'Booking updated';
    }
  }

  String get nextStepDescription {
    switch (booking.status) {
      case 'pending':
        return 'You’ll be notified once the provider responds.';

      case 'accepted':
        return 'Open your booking to see the next required step.';

      case 'waiting_payment':
        return 'Complete the required down payment to confirm your booking.';

      case 'payment_processing':
        return 'Your payment is being verified. No action is needed right now.';

      case 'confirmed':
        return 'Your booking is confirmed. You can coordinate with your provider through Chat.';

      case 'completed':
        return 'Your event is complete. You can review the provider from the booking details page.';

      case 'cancelled':
        return 'Open the booking to review the cancellation information.';

      case 'rejected':
        return 'Open the booking to review the provider response.';

      case 'expired':
        return 'This booking request can no longer be confirmed.';

      default:
        return 'Open the booking to see the latest details.';
    }
  }

  IconData get nextStepIcon {
    switch (booking.status) {
      case 'pending':
        return Icons.schedule_rounded;

      case 'accepted':
        return Icons.thumb_up_alt_outlined;

      case 'waiting_payment':
        return Icons.account_balance_wallet_outlined;

      case 'payment_processing':
        return Icons.sync_rounded;

      case 'confirmed':
        return Icons.verified_rounded;

      case 'completed':
        return Icons.check_circle_outline_rounded;

      case 'cancelled':
      case 'rejected':
      case 'expired':
        return Icons.info_outline_rounded;

      default:
        return Icons.event_note_outlined;
    }
  }

  Color get nextStepColor {
    switch (booking.status) {
      case 'confirmed':
      case 'completed':
        return AppColors.success;

      case 'cancelled':
      case 'rejected':
      case 'expired':
        return AppColors.error;

      default:
        return AppColors.primaryStrong;
    }
  }

  Color get nextStepBackground {
    switch (booking.status) {
      case 'confirmed':
      case 'completed':
        return AppColors.successSubtle;

      case 'cancelled':
      case 'rejected':
      case 'expired':
        return AppColors.errorSubtle;

      default:
        return AppColors.primarySubtle;
    }
  }

  void _openDetails(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BookingDetailsScreen(bookingId: booking.id),
      ),
    );
  }

  void _openChat(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            ChatScreen(booking: booking, currentRole: UserRoles.customer),
      ),
    );
  }

  void _openPayment(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentRequiredScreen(booking: booking),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final textScaler = MediaQuery.textScalerOf(context);

    final largeText = textScaler.scale(16) >= 22;

    return Semantics(
      container: true,
      explicitChildNodes: true,
      label:
          'Booking with ${booking.providerBusinessName}. '
          '${booking.eventType}. '
          'Status $statusLabel. '
          'Event date $formattedDate.',
      child: FeastaCard(
        semanticLabel:
            'Booking with ${booking.providerBusinessName}, '
            '${booking.eventType}, '
            '$statusLabel, '
            '$formattedDate',
        padding: EdgeInsets.zero,
        onTap: () {
          _openDetails(context);
        },
        child: largeText
            ? _LargeTextBookingContent(
                booking: booking,
                statusLabel: statusLabel,
                statusTone: statusTone,
                formattedDate: formattedDate,
                nextStepTitle: nextStepTitle,
                nextStepDescription: nextStepDescription,
                nextStepIcon: nextStepIcon,
                nextStepColor: nextStepColor,
                nextStepBackground: nextStepBackground,
                onDetails: () {
                  _openDetails(context);
                },
                onChat: () {
                  _openChat(context);
                },
                onPayment: () {
                  _openPayment(context);
                },
              )
            : _StandardBookingContent(
                booking: booking,
                statusLabel: statusLabel,
                statusTone: statusTone,
                formattedDate: formattedDate,
                nextStepTitle: nextStepTitle,
                nextStepDescription: nextStepDescription,
                nextStepIcon: nextStepIcon,
                nextStepColor: nextStepColor,
                nextStepBackground: nextStepBackground,
                onDetails: () {
                  _openDetails(context);
                },
                onChat: () {
                  _openChat(context);
                },
                onPayment: () {
                  _openPayment(context);
                },
              ),
      ),
    );
  }
}

class _StandardBookingContent extends StatelessWidget {
  const _StandardBookingContent({
    required this.booking,
    required this.statusLabel,
    required this.statusTone,
    required this.formattedDate,
    required this.nextStepTitle,
    required this.nextStepDescription,
    required this.nextStepIcon,
    required this.nextStepColor,
    required this.nextStepBackground,
    required this.onDetails,
    required this.onChat,
    required this.onPayment,
  });

  final BookingModel booking;

  final String statusLabel;
  final FeastaStatusTone statusTone;
  final String formattedDate;

  final String nextStepTitle;
  final String nextStepDescription;
  final IconData nextStepIcon;
  final Color nextStepColor;
  final Color nextStepBackground;

  final VoidCallback onDetails;
  final VoidCallback onChat;
  final VoidCallback onPayment;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.card),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _ProviderIcon(status: booking.status),

                  const SizedBox(width: AppSpacing.md),

                  Expanded(child: _ProviderBookingInfo(booking: booking)),

                  const SizedBox(width: AppSpacing.sm),

                  FeastaStatusBadge(label: statusLabel, tone: statusTone),
                ],
              ),

              const SizedBox(height: AppSpacing.lg),

              Wrap(
                spacing: AppSpacing.md,
                runSpacing: AppSpacing.sm,
                children: [
                  _BookingMeta(
                    icon: Icons.calendar_month_outlined,
                    text: formattedDate,
                  ),

                  if (booking.eventTime.trim().isNotEmpty)
                    _BookingMeta(
                      icon: Icons.schedule_rounded,
                      text: booking.eventTime,
                    ),

                  _BookingMeta(
                    icon: Icons.groups_outlined,
                    text: '${booking.guestCount} guests',
                  ),
                ],
              ),

              const SizedBox(height: AppSpacing.md),

              Row(
                children: [
                  Expanded(
                    child: Text(
                      booking.eventType,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Text(
                      booking.bookingCode,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.right,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        _NextStepPanel(
          title: nextStepTitle,
          description: nextStepDescription,
          icon: nextStepIcon,
          foreground: nextStepColor,
          background: nextStepBackground,
        ),

        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.card,
            AppSpacing.md,
            AppSpacing.card,
            AppSpacing.card,
          ),
          child: _BookingCardActions(
            booking: booking,
            onDetails: onDetails,
            onChat: onChat,
            onPayment: onPayment,
            forceStack: false,
          ),
        ),
      ],
    );
  }
}

class _LargeTextBookingContent extends StatelessWidget {
  const _LargeTextBookingContent({
    required this.booking,
    required this.statusLabel,
    required this.statusTone,
    required this.formattedDate,
    required this.nextStepTitle,
    required this.nextStepDescription,
    required this.nextStepIcon,
    required this.nextStepColor,
    required this.nextStepBackground,
    required this.onDetails,
    required this.onChat,
    required this.onPayment,
  });

  final BookingModel booking;

  final String statusLabel;
  final FeastaStatusTone statusTone;
  final String formattedDate;

  final String nextStepTitle;
  final String nextStepDescription;
  final IconData nextStepIcon;
  final Color nextStepColor;
  final Color nextStepBackground;

  final VoidCallback onDetails;
  final VoidCallback onChat;
  final VoidCallback onPayment;

  @override
  Widget build(BuildContext context) {
    final packageName = booking.packageName.trim().isEmpty
        ? booking.eventType
        : booking.packageName;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.card),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ProviderIcon(status: booking.status),

              const SizedBox(height: AppSpacing.md),

              Text(
                booking.providerBusinessName,
                style: AppTypography.cardTitle.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: AppSpacing.xs),

              Text(
                packageName,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  fontWeight: FontWeight.w600,
                ),
              ),

              const SizedBox(height: AppSpacing.md),

              Align(
                alignment: Alignment.centerLeft,
                child: FeastaStatusBadge(label: statusLabel, tone: statusTone),
              ),

              const SizedBox(height: AppSpacing.lg),

              _LargeTextDetail(label: 'Event date', value: formattedDate),

              const SizedBox(height: AppSpacing.sm),

              if (booking.eventTime.trim().isNotEmpty) ...[
                _LargeTextDetail(label: 'Event time', value: booking.eventTime),
                const SizedBox(height: AppSpacing.sm),
              ],

              _LargeTextDetail(
                label: 'Guests',
                value: '${booking.guestCount} guests',
              ),

              const SizedBox(height: AppSpacing.sm),

              _LargeTextDetail(label: 'Event type', value: booking.eventType),

              const SizedBox(height: AppSpacing.sm),

              _LargeTextDetail(
                label: 'Booking code',
                value: booking.bookingCode,
              ),
            ],
          ),
        ),

        _LargeTextNextStepPanel(
          title: nextStepTitle,
          description: nextStepDescription,
          icon: nextStepIcon,
          foreground: nextStepColor,
          background: nextStepBackground,
        ),

        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.card,
            AppSpacing.md,
            AppSpacing.card,
            AppSpacing.card,
          ),
          child: _BookingCardActions(
            booking: booking,
            onDetails: onDetails,
            onChat: onChat,
            onPayment: onPayment,
            forceStack: true,
          ),
        ),
      ],
    );
  }
}

class _LargeTextDetail extends StatelessWidget {
  const _LargeTextDetail({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.caption.copyWith(
            color: AppColors.secondaryTextAccessible,
            fontWeight: FontWeight.w700,
          ),
        ),

        const SizedBox(height: AppSpacing.xxs),

        Text(
          value,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _ProviderBookingInfo extends StatelessWidget {
  const _ProviderBookingInfo({required this.booking});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    final packageName = booking.packageName.trim().isEmpty
        ? booking.eventType
        : booking.packageName;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          booking.providerBusinessName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.cardTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),

        const SizedBox(height: AppSpacing.xxs),

        Text(
          packageName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _ProviderIcon extends StatelessWidget {
  const _ProviderIcon({required this.status});

  final String status;

  Color get foreground {
    switch (status) {
      case 'confirmed':
      case 'completed':
        return AppColors.success;

      case 'cancelled':
      case 'rejected':
      case 'expired':
        return AppColors.error;

      default:
        return AppColors.primaryStrong;
    }
  }

  Color get background {
    switch (status) {
      case 'confirmed':
      case 'completed':
        return AppColors.successSubtle;

      case 'cancelled':
      case 'rejected':
      case 'expired':
        return AppColors.errorSubtle;

      default:
        return AppColors.primarySubtle;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 54,
      height: 54,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadius.large),
      ),
      child: Icon(Icons.restaurant_menu_rounded, color: foreground, size: 26),
    );
  }
}

class _BookingMeta extends StatelessWidget {
  const _BookingMeta({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 17, color: AppColors.secondaryTextAccessible),

        const SizedBox(width: 5),

        Text(
          text,
          style: AppTypography.caption.copyWith(
            color: AppColors.secondaryTextAccessible,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _NextStepPanel extends StatelessWidget {
  const _NextStepPanel({
    required this.title,
    required this.description,
    required this.icon,
    required this.foreground,
    required this.background,
  });

  final String title;
  final String description;
  final IconData icon;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: background,
        borderRadius: const BorderRadius.vertical(
          bottom: Radius.circular(AppRadius.card),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
            child: Icon(icon, color: foreground, size: 20),
          ),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
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
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  description,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.4,
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

class _LargeTextNextStepPanel extends StatelessWidget {
  const _LargeTextNextStepPanel({
    required this.title,
    required this.description,
    required this.icon,
    required this.foreground,
    required this.background,
  });

  final String title;
  final String description;
  final IconData icon;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.card),
      decoration: BoxDecoration(
        color: background,
        borderRadius: const BorderRadius.vertical(
          bottom: Radius.circular(AppRadius.card),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
            child: Icon(icon, color: foreground, size: 20),
          ),

          const SizedBox(height: AppSpacing.sm),

          Text(
            title,
            style: AppTypography.label.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: AppSpacing.xs),

          Text(
            description,
            style: AppTypography.caption.copyWith(
              color: AppColors.secondaryTextAccessible,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingCardActions extends StatelessWidget {
  const _BookingCardActions({
    required this.booking,
    required this.onDetails,
    required this.onChat,
    required this.onPayment,
    required this.forceStack,
  });

  final BookingModel booking;

  final VoidCallback onDetails;
  final VoidCallback onChat;
  final VoidCallback onPayment;

  final bool forceStack;

  bool get showPayment {
    return booking.status == BookingStatus.waitingPayment;
  }

  bool get showChat {
    return booking.status == BookingStatus.confirmed ||
        booking.status == BookingStatus.completed;
  }

  ButtonStyle get _outlinedStyle {
    return OutlinedButton.styleFrom(
      foregroundColor: AppColors.mainText,
      minimumSize: const Size(0, 52),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      side: const BorderSide(color: AppColors.border),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.large),
      ),
    );
  }

  ButtonStyle get _primaryStyle {
    return ElevatedButton.styleFrom(
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
      minimumSize: const Size(0, 52),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.large),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (showPayment) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ElevatedButton(
            onPressed: onPayment,
            style: _primaryStyle,
            child: Text(
              'Pay down payment',
              textAlign: TextAlign.center,
              style: AppTypography.button.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),

          const SizedBox(height: AppSpacing.sm),

          OutlinedButton(
            onPressed: onDetails,
            style: _outlinedStyle,
            child: Text(
              'View details',
              textAlign: TextAlign.center,
              style: AppTypography.button.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      );
    }

    if (showChat) {
      if (forceStack) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            OutlinedButton(
              onPressed: onDetails,
              style: _outlinedStyle,
              child: Text(
                'View details',
                textAlign: TextAlign.center,
                style: AppTypography.button.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),

            const SizedBox(height: AppSpacing.sm),

            ElevatedButton(
              onPressed: onChat,
              style: _primaryStyle,
              child: Text(
                'Chat',
                textAlign: TextAlign.center,
                style: AppTypography.button.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        );
      }

      return Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: onDetails,
              style: _outlinedStyle,
              child: Text(
                'View details',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.button.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
            child: ElevatedButton(
              onPressed: onChat,
              style: _primaryStyle,
              child: Text(
                'Chat',
                style: AppTypography.button.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      );
    }

    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onDetails,
        style: _outlinedStyle,
        child: Text(
          'View details',
          textAlign: TextAlign.center,
          style: AppTypography.button.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}
