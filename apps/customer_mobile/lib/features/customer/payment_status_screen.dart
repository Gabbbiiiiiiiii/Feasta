import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/customer_payment_request.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_details_screen.dart';
import 'customer_main_screen.dart';
import 'payment_required_screen.dart';

class PaymentStatusScreen extends StatelessWidget {
  const PaymentStatusScreen({
    required this.bookingId,
    required this.providerRequestId,
    required this.paymentChoice,
    required this.amountInCentavos,
    super.key,
  });

  final String bookingId;
  final String providerRequestId;
  final CustomerPaymentChoice paymentChoice;
  final int amountInCentavos;

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
        builder: (context, bookingSnapshot) {
          if (bookingSnapshot.connectionState == ConnectionState.waiting &&
              bookingSnapshot.data == null) {
            return const _PaymentStatusLoading();
          }

          if (bookingSnapshot.hasError) {
            return const FeastaApplicationErrorState(
              kind: FeastaErrorKind.load,
              message: 'We could not check the booking linked to this payment.',
            );
          }

          final booking = bookingSnapshot.data;

          if (booking == null) {
            return const FeastaEmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'Booking not found',
              message: 'We could not find the booking linked to this payment.',
            );
          }

          return StreamBuilder<CustomerProviderPaymentRequest?>(
            stream: repository.customerPaymentRequestById(
              bookingId: booking.id,
              mainEventStatus: booking.status,
              providerRequestId: providerRequestId,
            ),
            builder: (context, requestSnapshot) {
              if (requestSnapshot.connectionState == ConnectionState.waiting &&
                  requestSnapshot.data == null) {
                return const _PaymentStatusLoading();
              }

              if (requestSnapshot.hasError) {
                return const FeastaApplicationErrorState(
                  kind: FeastaErrorKind.load,
                  message:
                      'We could not check the provider payment status. '
                      'Please return to the booking and try again.',
                );
              }

              final request = requestSnapshot.data;

              if (request == null) {
                return const FeastaEmptyState(
                  icon: Icons.payments_outlined,
                  title: 'Payment request unavailable',
                  message: 'The provider payment request could not be found.',
                );
              }

              final state = _PaymentDisplayState.fromRequest(
                request: request,
                paymentChoice: paymentChoice,
              );

              return _PaymentStatusContent(
                booking: booking,
                request: request,
                paymentChoice: paymentChoice,
                amountInCentavos: amountInCentavos,
                state: state,
              );
            },
          );
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
  cancelled,
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

  bool get showProgress =>
      kind == _PaymentStateKind.processing || kind == _PaymentStateKind.waiting;

  factory _PaymentDisplayState.fromRequest({
    required CustomerProviderPaymentRequest request,
    required CustomerPaymentChoice paymentChoice,
  }) {
    final paymentStatus = request.paymentStatus;
    final settlementStatus = request.settlementStatus;

    if (paymentStatus == 'refunded' || paymentStatus == 'partially_refunded') {
      return _PaymentDisplayState(
        kind: _PaymentStateKind.refunded,
        title: paymentStatus == 'partially_refunded'
            ? 'Payment partially refunded'
            : 'Payment refunded',
        description:
            'This payment has a refund recorded. '
            'Open the booking details for the latest financial status.',
        icon: Icons.replay_rounded,
        foreground: AppColors.primaryStrong,
        background: AppColors.primarySubtle,
      );
    }

    if (paymentStatus == 'cancelled') {
      return const _PaymentDisplayState(
        kind: _PaymentStateKind.cancelled,
        title: 'Payment cancelled',
        description:
            'This payment attempt was cancelled. '
            'Open the payment options to review what is available next.',
        icon: Icons.cancel_outlined,
        foreground: AppColors.error,
        background: AppColors.errorSubtle,
      );
    }

    if (paymentStatus == 'failed') {
      return const _PaymentDisplayState(
        kind: _PaymentStateKind.failed,
        title: 'Payment unsuccessful',
        description:
            'The payment was not completed successfully. '
            'You may retry when FEASTA confirms another checkout is allowed.',
        icon: Icons.error_outline_rounded,
        foreground: AppColors.error,
        background: AppColors.errorSubtle,
      );
    }

    if (paymentStatus == 'expired') {
      return const _PaymentDisplayState(
        kind: _PaymentStateKind.expired,
        title: 'Payment expired',
        description: 'The secure payment session expired before confirmation.',
        icon: Icons.timer_off_outlined,
        foreground: AppColors.error,
        background: AppColors.errorSubtle,
      );
    }

    final successfullySettled = switch (paymentChoice) {
      CustomerPaymentChoice.minimum =>
        paymentStatus == 'paid' &&
            (settlementStatus == 'deposit_settled' ||
                settlementStatus == 'fully_settled'),
      CustomerPaymentChoice.full =>
        paymentStatus == 'paid' && settlementStatus == 'fully_settled',
      CustomerPaymentChoice.remainingBalance =>
        paymentStatus == 'paid' && settlementStatus == 'fully_settled',
    };

    if (successfullySettled) {
      return _PaymentDisplayState(
        kind: _PaymentStateKind.confirmed,
        title: paymentChoice == CustomerPaymentChoice.remainingBalance
            ? 'Remaining balance paid'
            : 'Payment confirmed',
        description: paymentChoice == CustomerPaymentChoice.minimum
            ? 'Your minimum payment was verified. '
                  'The booking can remain active with a remaining balance.'
            : paymentChoice == CustomerPaymentChoice.remainingBalance
            ? 'The remaining provider balance was verified successfully.'
            : 'Your full provider payment was verified successfully.',
        icon: Icons.verified_rounded,
        foreground: AppColors.success,
        background: AppColors.successSubtle,
      );
    }

    if (paymentStatus == 'processing' ||
        settlementStatus == 'initial_payment_processing' ||
        settlementStatus == 'balance_payment_processing') {
      return const _PaymentDisplayState(
        kind: _PaymentStateKind.processing,
        title: 'Confirming your payment',
        description:
            'FEASTA is waiting for trusted PayMongo confirmation. '
            'This page updates automatically.',
        icon: Icons.sync_rounded,
        foreground: AppColors.primaryStrong,
        background: AppColors.primarySubtle,
      );
    }

    return const _PaymentDisplayState(
      kind: _PaymentStateKind.waiting,
      title: 'Waiting for payment confirmation',
      description:
          'No successful payment confirmation has been received yet. '
          'This page will update automatically when the provider payment '
          'state changes.',
      icon: Icons.schedule_rounded,
      foreground: AppColors.primaryStrong,
      background: AppColors.primarySubtle,
    );
  }
}

class _PaymentStatusContent extends StatelessWidget {
  const _PaymentStatusContent({
    required this.booking,
    required this.request,
    required this.paymentChoice,
    required this.amountInCentavos,
    required this.state,
  });

  final BookingModel booking;
  final CustomerProviderPaymentRequest request;
  final CustomerPaymentChoice paymentChoice;
  final int amountInCentavos;
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

        _PaymentReferenceCard(
          booking: booking,
          request: request,
          paymentChoice: paymentChoice,
        ),

        const SizedBox(height: AppSpacing.md),

        _PaymentAmountCard(
          paymentChoice: paymentChoice,
          amountInCentavos: amountInCentavos,
          request: request,
        ),

        const SizedBox(height: AppSpacing.md),

        _PaymentConfirmationNotice(state: state),

        const SizedBox(height: AppSpacing.xl),

        if (state.canRetry) ...[
          FeastaPrimaryButton(
            label: 'Review Payment Options',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              _retryPayment(context);
            },
          ),
          const SizedBox(height: AppSpacing.sm),
        ],

        if (state.isSuccess)
          FeastaPrimaryButton(
            label: 'View Booking',
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
  const _PaymentReferenceCard({
    required this.booking,
    required this.request,
    required this.paymentChoice,
  });

  final BookingModel booking;
  final CustomerProviderPaymentRequest request;
  final CustomerPaymentChoice paymentChoice;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Payment information',
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
            value: request.providerBusinessName,
          ),

          const Divider(height: AppSpacing.lg, color: AppColors.border),

          _StatusDetailRow(label: 'Service', value: request.packageName),

          const Divider(height: AppSpacing.lg, color: AppColors.border),

          _StatusDetailRow(
            label: 'Payment type',
            value: _choiceLabel(paymentChoice),
          ),

          const Divider(height: AppSpacing.lg, color: AppColors.border),

          _StatusDetailRow(
            label: 'Payment status',
            value: _humanize(request.paymentStatus),
          ),

          if (request.settlementStatus != null) ...[
            const Divider(height: AppSpacing.lg, color: AppColors.border),
            _StatusDetailRow(
              label: 'Settlement',
              value: _humanize(request.settlementStatus!),
            ),
          ],
        ],
      ),
    );
  }
}

class _PaymentAmountCard extends StatelessWidget {
  const _PaymentAmountCard({
    required this.paymentChoice,
    required this.amountInCentavos,
    required this.request,
  });

  final CustomerPaymentChoice paymentChoice;
  final int amountInCentavos;
  final CustomerProviderPaymentRequest request;

  @override
  Widget build(BuildContext context) {
    final outstanding = request.outstandingAmountInCentavos;

    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Payment summary',
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: AppSpacing.lg),

          _StatusDetailRow(
            label: _choiceLabel(paymentChoice),
            value: _pesoFromCentavos(amountInCentavos),
          ),

          if (outstanding != null) ...[
            const Divider(height: AppSpacing.lg, color: AppColors.border),
            _StatusDetailRow(
              label: 'Outstanding provider balance',
              value: _pesoFromCentavos(outstanding),
            ),
          ],
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
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            state.isSuccess
                ? Icons.verified_user_outlined
                : Icons.security_rounded,
            color: state.isSuccess
                ? AppColors.success
                : AppColors.primaryStrong,
          ),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
            child: Text(
              state.isSuccess
                  ? 'This status is based on FEASTA’s trusted '
                        'provider-payment settlement state.'
                  : 'Do not rely only on the browser result. '
                        'FEASTA marks payment complete only after '
                        'trusted backend confirmation.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
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

class _PaymentStatusLoading extends StatelessWidget {
  const _PaymentStatusLoading();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(AppSpacing.screen),
        child: CircularProgressIndicator(),
      ),
    );
  }
}

String _choiceLabel(CustomerPaymentChoice choice) {
  switch (choice) {
    case CustomerPaymentChoice.minimum:
      return 'Minimum payment';

    case CustomerPaymentChoice.full:
      return 'Full payment';

    case CustomerPaymentChoice.remainingBalance:
      return 'Remaining balance';
  }
}

String _humanize(String value) {
  final normalized = value.trim();

  if (normalized.isEmpty) {
    return 'Unavailable';
  }

  return normalized
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

String _pesoFromCentavos(int value) {
  return '₱${(value / 100).toStringAsFixed(2)}';
}
