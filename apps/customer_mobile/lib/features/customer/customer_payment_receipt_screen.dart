import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/customer_payment_request.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'customer_payment_tax_breakdown.dart';

/// Platform payment record for a settled provider request.
/// Uses customer-readable provider-request settlement fields only.
/// Payment documents are admin/server-only, matching web receipt authority.
class CustomerPaymentReceiptScreen extends StatelessWidget {
  const CustomerPaymentReceiptScreen({
    required this.bookingId,
    required this.providerRequestId,
    super.key,
  });

  final String bookingId;
  final String providerRequestId;

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
          'Payment Receipt',
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
            return const Center(child: CircularProgressIndicator());
          }

          if (bookingSnapshot.hasError || bookingSnapshot.data == null) {
            return const FeastaApplicationErrorState(
              kind: FeastaErrorKind.load,
              message: 'We could not load the booking for this receipt.',
            );
          }

          final booking = bookingSnapshot.data!;

          return StreamBuilder<CustomerProviderPaymentRequest?>(
            stream: repository.customerPaymentRequestById(
              bookingId: booking.id,
              mainEventStatus: booking.status,
              providerRequestId: providerRequestId,
            ),
            builder: (context, requestSnapshot) {
              if (requestSnapshot.connectionState == ConnectionState.waiting &&
                  requestSnapshot.data == null) {
                return const Center(child: CircularProgressIndicator());
              }

              if (requestSnapshot.hasError || requestSnapshot.data == null) {
                return const FeastaApplicationErrorState(
                  kind: FeastaErrorKind.load,
                  message: 'This payment receipt is unavailable.',
                );
              }

              final request = requestSnapshot.data!;
              if (!request.canViewPaymentReceipt) {
                return const FeastaEmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: 'Receipt not ready',
                  message:
                      'A payment receipt appears after FEASTA confirms a '
                      'settled provider payment for this booking.',
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
                  _ReceiptHeader(request: request),
                  const SizedBox(height: AppSpacing.md),
                  _ReceiptFacts(booking: booking, request: request),
                  const SizedBox(height: AppSpacing.md),
                  _ReceiptAmounts(request: request),
                  const SizedBox(height: AppSpacing.md),
                  CustomerPaymentTaxBreakdown(request: request),
                  const SizedBox(height: AppSpacing.md),
                  _ReceiptNotice(),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _ReceiptHeader extends StatelessWidget {
  const _ReceiptHeader({required this.request});

  final CustomerProviderPaymentRequest request;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.receipt_long_outlined,
                color: AppColors.primaryStrong,
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                'FEASTA',
                style: AppTypography.label.copyWith(
                  color: AppColors.primaryStrong,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            'Payment Receipt',
            style: AppTypography.pageTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Platform record of a payment processed for a FEASTA booking.',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.xs,
              ),
              decoration: BoxDecoration(
                color: AppColors.primarySubtle,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text(
                _humanize(request.paymentStatus),
                style: AppTypography.label.copyWith(
                  color: AppColors.primaryStrong,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReceiptFacts extends StatelessWidget {
  const _ReceiptFacts({required this.booking, required this.request});

  final BookingModel booking;
  final CustomerProviderPaymentRequest request;

  @override
  Widget build(BuildContext context) {
    final references = request.paymentReferenceIds;
    final paidAt = request.paidAt;

    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Booking & payment details',
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          _Fact(
            label: 'Booking reference',
            value: booking.bookingCode.isEmpty ? booking.id : booking.bookingCode,
          ),
          if (references.isNotEmpty) ...[
            const Divider(height: AppSpacing.lg, color: AppColors.border),
            _Fact(
              label: references.length == 1
                  ? 'Payment reference'
                  : 'Payment references',
              value: references.join('\n'),
            ),
          ],
          const Divider(height: AppSpacing.lg, color: AppColors.border),
          _Fact(label: 'Provider', value: request.providerBusinessName),
          const Divider(height: AppSpacing.lg, color: AppColors.border),
          _Fact(label: 'Service', value: request.packageName),
          if (paidAt != null) ...[
            const Divider(height: AppSpacing.lg, color: AppColors.border),
            _Fact(
              label: 'Paid date and time',
              value: _formatPaidAt(paidAt),
            ),
          ],
          if (request.settlementStatus != null) ...[
            const Divider(height: AppSpacing.lg, color: AppColors.border),
            _Fact(
              label: 'Settlement',
              value: _humanize(request.settlementStatus!),
            ),
          ],
        ],
      ),
    );
  }
}

class _ReceiptAmounts extends StatelessWidget {
  const _ReceiptAmounts({required this.request});

  final CustomerProviderPaymentRequest request;

  @override
  Widget build(BuildContext context) {
    final settled = request.grossSettledAmountInCentavos;
    final outstanding = request.outstandingAmountInCentavos;
    final serviceCharge = request.serviceChargeInCentavos;

    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Transaction summary',
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          if (settled != null)
            _AmountRow(label: 'Amount paid', amountInCentavos: settled)
          else
            Text(
              'Settled amount unavailable for this receipt.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          if (serviceCharge != null) ...[
            const Divider(height: AppSpacing.lg, color: AppColors.border),
            _AmountRow(
              label: 'Service charge',
              amountInCentavos: serviceCharge,
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Service charge is deducted from provider proceeds. '
              'It is not an additional customer charge.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ],
          if (outstanding != null) ...[
            const Divider(height: AppSpacing.lg, color: AppColors.border),
            _AmountRow(
              label: 'Outstanding provider balance',
              amountInCentavos: outstanding,
            ),
          ],
        ],
      ),
    );
  }
}

class _ReceiptNotice extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        'This Payment Receipt is a FEASTA platform payment record for the '
        'settled provider request shown. It is not a statutory fiscal document.',
        style: AppTypography.bodySmall.copyWith(
          color: AppColors.secondaryTextAccessible,
          height: 1.45,
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
          ),
        ),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          value,
          style: AppTypography.body.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _AmountRow extends StatelessWidget {
  const _AmountRow({required this.label, required this.amountInCentavos});

  final String label;
  final int amountInCentavos;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        FeastaPriceText(
          amount: amountInCentavos / 100,
          decimalDigits: 2,
          semanticLabel: label,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

String _humanize(String value) {
  if (value.trim().isEmpty) return value;
  return value
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

String _formatPaidAt(DateTime value) {
  final local = value.toLocal();
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
  final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final minute = local.minute.toString().padLeft(2, '0');
  final period = local.hour >= 12 ? 'PM' : 'AM';
  return '${months[local.month - 1]} ${local.day}, ${local.year} · '
      '$hour:$minute $period';
}
