import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_details_screen.dart';
import 'customer_main_screen.dart';
import 'payment_required_screen.dart';

class PaymentStatusScreen extends StatelessWidget {
  const PaymentStatusScreen({required this.bookingId, super.key});

  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final repository = FeastaRepository();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Payment Status',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: StreamBuilder<BookingModel?>(
        stream: repository.bookingById(bookingId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              snapshot.data == null) {
            return const _PaymentStatusLoading();
          }

          if (snapshot.hasError) {
            return FeastaApplicationErrorState(
              kind: FeastaErrorKind.load,
              message:
                  'We could not check your payment status. '
                  'Your payment record is still protected. '
                  'Please try again.',
              onRetry: () {},
            );
          }

          final booking = snapshot.data;

          if (booking == null) {
            return const FeastaEmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'Booking not found',
              message: 'We could not find the booking linked to this payment.',
            );
          }

          final state = _PaymentDisplayState.fromBooking(booking);

          return _PaymentStatusContent(booking: booking, state: state);
        },
      ),
    );
  }
}

enum _PaymentStateKind {
  waiting,
  processing,
  confirmed,
  failed,
  expired,
  refunded,
}

class _PaymentDisplayState {
  const _PaymentDisplayState({
    required this.kind,
    required this.title,
    required this.description,
    required this.icon,
    required this.foreground,
    required this.background,
  });

  final _PaymentStateKind kind;

  final String title;
  final String description;

  final IconData icon;

  final Color foreground;
  final Color background;

  bool get isSuccess => kind == _PaymentStateKind.confirmed;

  bool get canRetry =>
      kind == _PaymentStateKind.failed ||
      kind == _PaymentStateKind.expired ||
      kind == _PaymentStateKind.waiting;

  bool get showProgress => kind == _PaymentStateKind.processing;

  factory _PaymentDisplayState.fromBooking(BookingModel booking) {
    if (booking.status == BookingStatus.confirmed ||
        booking.paymentStatus == PaymentStatus.partiallyPaid ||
        booking.paymentStatus == PaymentStatus.paid) {
      return const _PaymentDisplayState(
        kind: _PaymentStateKind.confirmed,
        title: 'Payment confirmed',
        description:
            'Your payment has been verified and your booking is confirmed.',
        icon: Icons.verified_rounded,
        foreground: AppColors.success,
        background: AppColors.successSubtle,
      );
    }

    if (booking.status == BookingStatus.paymentProcessing ||
        booking.paymentStatus == PaymentRecordStatus.pending ||
        booking.paymentStatus == PaymentRecordStatus.processing) {
      return const _PaymentDisplayState(
        kind: _PaymentStateKind.processing,
        title: 'Confirming your payment',
        description:
            'Your payment is being verified securely. '
            'This page will update automatically when FEASTA '
            'receives the payment confirmation.',
        icon: Icons.sync_rounded,
        foreground: AppColors.primaryStrong,
        background: AppColors.primarySubtle,
      );
    }

    if (booking.paymentStatus == PaymentStatus.failed) {
      return const _PaymentDisplayState(
        kind: _PaymentStateKind.failed,
        title: 'Payment unsuccessful',
        description:
            'The payment was not completed successfully. '
            'Your booking has not been confirmed.',
        icon: Icons.error_outline_rounded,
        foreground: AppColors.error,
        background: AppColors.errorSubtle,
      );
    }

    if (booking.paymentStatus == PaymentStatus.expired ||
        booking.status == BookingStatus.expired) {
      return const _PaymentDisplayState(
        kind: _PaymentStateKind.expired,
        title: 'Payment expired',
        description:
            'The payment session or booking payment window expired '
            'before confirmation was received.',
        icon: Icons.timer_off_outlined,
        foreground: AppColors.error,
        background: AppColors.errorSubtle,
      );
    }

    if (booking.paymentStatus == PaymentStatus.refunded) {
      return const _PaymentDisplayState(
        kind: _PaymentStateKind.refunded,
        title: 'Payment refunded',
        description:
            'This payment has been refunded. '
            'Open the booking details to review the latest status.',
        icon: Icons.replay_rounded,
        foreground: AppColors.primaryStrong,
        background: AppColors.primarySubtle,
      );
    }

    return const _PaymentDisplayState(
      kind: _PaymentStateKind.waiting,
      title: 'Waiting for payment',
      description:
          'We have not received a successful payment confirmation yet. '
          'If you already completed PayMongo checkout, keep this page open '
          'while FEASTA waits for the secure confirmation.',
      icon: Icons.schedule_rounded,
      foreground: AppColors.primaryStrong,
      background: AppColors.primarySubtle,
    );
  }
}

class _PaymentStatusContent extends StatelessWidget {
  const _PaymentStatusContent({required this.booking, required this.state});

  final BookingModel booking;
  final _PaymentDisplayState state;

  void _openBooking(BuildContext context) {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => BookingDetailsScreen(bookingId: booking.id),
      ),
    );
  }

  void _openBookings(BuildContext context) {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => const CustomerMainScreen(initialIndex: 2),
      ),
      (_) => false,
    );
  }

  void _retryPayment(BuildContext context) {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentRequiredScreen(booking: booking),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.lg,
        AppSpacing.screen,
        AppSpacing.xl,
      ),
      children: [
        _PaymentStateHero(state: state),

        const SizedBox(height: AppSpacing.xl),

        _PaymentReferenceCard(booking: booking),

        const SizedBox(height: AppSpacing.md),

        _PaymentAmountCard(booking: booking),

        const SizedBox(height: AppSpacing.md),

        _PaymentConfirmationNotice(state: state),

        const SizedBox(height: AppSpacing.xl),

        if (state.canRetry) ...[
          FeastaPrimaryButton(
            label: 'Try Payment Again',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              _retryPayment(context);
            },
          ),
          const SizedBox(height: AppSpacing.sm),
        ],

        if (state.isSuccess)
          FeastaPrimaryButton(
            label: 'View Confirmed Booking',
            icon: const Icon(Icons.event_available_rounded),
            onPressed: () {
              _openBooking(context);
            },
          )
        else
          FeastaSecondaryButton(
            label: 'View Booking Details',
            icon: const Icon(Icons.receipt_long_outlined),
            onPressed: () {
              _openBooking(context);
            },
          ),

        const SizedBox(height: AppSpacing.sm),

        TextButton(
          onPressed: () {
            _openBookings(context);
          },
          child: Text(
            'Back to My Bookings',
            style: AppTypography.label.copyWith(
              color: AppColors.primaryStrong,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _PaymentStateHero extends StatelessWidget {
  const _PaymentStateHero({required this.state});

  final _PaymentDisplayState state;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: state.background,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Container(
            width: 104,
            height: 104,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: state.showProgress
                ? SizedBox(
                    width: 48,
                    height: 48,
                    child: CircularProgressIndicator(
                      strokeWidth: 3,
                      color: state.foreground,
                    ),
                  )
                : Icon(state.icon, color: state.foreground, size: 50),
          ),

          const SizedBox(height: AppSpacing.lg),

          Text(
            state.title,
            textAlign: TextAlign.center,
            style: AppTypography.pageTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: AppSpacing.sm),

          Text(
            state.description,
            textAlign: TextAlign.center,
            style: AppTypography.body.copyWith(
              color: AppColors.secondaryTextAccessible,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentReferenceCard extends StatelessWidget {
  const _PaymentReferenceCard({required this.booking});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Booking information',
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: AppSpacing.lg),

          _StatusDetailRow(label: 'Booking code', value: booking.bookingCode),

          const Divider(height: AppSpacing.lg, color: AppColors.border),

          _StatusDetailRow(
            label: 'Provider',
            value: booking.providerBusinessName,
          ),

          const Divider(height: AppSpacing.lg, color: AppColors.border),

          _StatusDetailRow(label: 'Package', value: booking.packageName),

          const Divider(height: AppSpacing.lg, color: AppColors.border),

          _StatusDetailRow(
            label: 'Booking status',
            value: _bookingStatusLabel(booking.status),
          ),

          const Divider(height: AppSpacing.lg, color: AppColors.border),

          _StatusDetailRow(
            label: 'Payment status',
            value: _paymentStatusLabel(booking.paymentStatus),
          ),
        ],
      ),
    );
  }
}

class _PaymentAmountCard extends StatelessWidget {
  const _PaymentAmountCard({required this.booking});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        children: [
          _AmountRow(label: 'Booking total', amount: booking.totalAmount),

          const SizedBox(height: AppSpacing.sm),

          _AmountRow(
            label: 'Down payment',
            amount: booking.downPaymentAmount,
            emphasized: true,
          ),

          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: Divider(height: 1, color: AppColors.border),
          ),

          _AmountRow(
            label: 'Remaining balance',
            amount: booking.remainingBalance,
          ),
        ],
      ),
    );
  }
}

class _PaymentConfirmationNotice extends StatelessWidget {
  const _PaymentConfirmationNotice({required this.state});

  final _PaymentDisplayState state;

  @override
  Widget build(BuildContext context) {
    final success = state.isSuccess;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: success ? AppColors.successSubtle : AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            success ? Icons.verified_user_outlined : Icons.security_outlined,
            color: success ? AppColors.success : AppColors.primaryStrong,
          ),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
            child: Text(
              success
                  ? 'FEASTA received the secure payment confirmation. '
                        'You do not need to submit a receipt manually.'
                  : 'Do not treat the PayMongo browser page alone as payment confirmation. '
                        'FEASTA confirms payment only after the secure backend update is received.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.mainText,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusDetailRow extends StatelessWidget {
  const _StatusDetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final largeText = MediaQuery.textScalerOf(context).scale(16) >= 22;

    if (largeText) {
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
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      );
    }

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

class _AmountRow extends StatelessWidget {
  const _AmountRow({
    required this.label,
    required this.amount,
    this.emphasized = false,
  });

  final String label;
  final double amount;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.mainText,
              fontWeight: emphasized ? FontWeight.w900 : FontWeight.w600,
            ),
          ),
        ),

        const SizedBox(width: AppSpacing.md),

        FeastaPriceText(
          amount: amount,
          decimalDigits: 0,
          semanticLabel: label,
          style: (emphasized ? AppTypography.cardTitle : AppTypography.label)
              .copyWith(
                color: emphasized
                    ? AppColors.primaryStrong
                    : AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
        ),
      ],
    );
  }
}

class _PaymentStatusLoading extends StatelessWidget {
  const _PaymentStatusLoading();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(color: AppColors.primary),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Checking payment status...',
              style: AppTypography.cardTitle.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'FEASTA is checking the latest secure booking information.',
              textAlign: TextAlign.center,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _bookingStatusLabel(String status) {
  switch (status) {
    case BookingStatus.pending:
      return 'Pending';

    case BookingStatus.accepted:
      return 'Accepted';

    case BookingStatus.waitingPayment:
      return 'Waiting for Payment';

    case BookingStatus.paymentProcessing:
      return 'Payment Processing';

    case BookingStatus.confirmed:
      return 'Confirmed';

    case BookingStatus.completed:
      return 'Completed';

    case BookingStatus.cancelled:
      return 'Cancelled';

    case BookingStatus.rejected:
      return 'Rejected';

    case BookingStatus.expired:
      return 'Expired';

    default:
      return status;
  }
}

String _paymentStatusLabel(String status) {
  switch (status) {
    case PaymentStatus.unpaid:
      return 'Unpaid';

    case PaymentStatus.partiallyPaid:
      return 'Partially Paid';

    case PaymentStatus.paid:
      return 'Paid';

    case PaymentStatus.failed:
      return 'Failed';

    case PaymentStatus.refunded:
      return 'Refunded';

    case PaymentStatus.expired:
      return 'Expired';

    case PaymentRecordStatus.pending:
      return 'Pending';

    case PaymentRecordStatus.processing:
      return 'Processing';

    default:
      return status;
  }
}
