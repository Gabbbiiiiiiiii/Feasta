import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/badges/feasta_price_text.dart';
import '../../shared/models/customer_payment_request.dart';

/// Shared VAT + service charge display for Payment Details and receipts.
class CustomerPaymentTaxBreakdown extends StatelessWidget {
  const CustomerPaymentTaxBreakdown({
    required this.request,
    this.compact = false,
    super.key,
  });

  final CustomerProviderPaymentRequest request;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final vat = request.serviceVat;
    final serviceCharge = request.serviceChargeInCentavos;

    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(compact ? AppSpacing.md : AppSpacing.card),
      decoration: BoxDecoration(
        color: compact ? AppColors.surface : AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tax & service charge',
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          if (vat == null)
            Text(
              request.agreedTotalInCentavos == null
                  ? 'VAT breakdown unavailable for this booking.'
                  : 'This booking has no verified provider VAT breakdown. '
                        'Your accepted total still applies.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            )
          else if (vat.taxType == 'vat_registered') ...[
            _MoneyRow(
              label: request.agreedTotalInCentavos == null
                  ? 'Included provider VAT (12%)'
                  : 'Included provider VAT',
              amountInCentavos: vat.includedVatInCentavos,
            ),
            const SizedBox(height: AppSpacing.sm),
            ExpansionTile(
              title: const Text('Tax breakdown'),
              tilePadding: EdgeInsets.zero,
              childrenPadding: EdgeInsets.zero,
              children: [
                _MoneyRow(
                  label: 'VAT-exclusive service amount',
                  amountInCentavos: vat.exclusiveInCentavos,
                ),
              ],
            ),
            Text(
              'VAT is already included in the service price. '
              'No additional charge.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ] else
            Text(
              'Non-VAT service. No provider VAT is added to the service price.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          const SizedBox(height: AppSpacing.md),
          if (serviceCharge != null) ...[
            _MoneyRow(
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
          ] else
            Text(
              'This booking has no recorded service charge breakdown.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
        ],
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({required this.label, required this.amountInCentavos});

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
