import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/booking_agreement.dart';

/// Shared presentation of the existing authoritative disclosure.
class BookingAgreementTerms extends StatelessWidget {
  const BookingAgreementTerms({
    required this.agreement,
    required this.acknowledged,
    required this.onChanged,
    super.key,
  });
  final BookingAgreement agreement;
  final bool acknowledged;
  final ValueChanged<bool?>? onChanged;
  @override
  Widget build(BuildContext context) {
    final a = agreement;
    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          Text(value),
        ],
      ),
    );
    return FeastaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(a.providerName, style: Theme.of(context).textTheme.titleLarge),
          row('Included services', a.serviceNames.join(', ')),
          if (a.serviceTierLabel != null)
            row('Service level', a.serviceTierLabel!),
          row('Scheduled event start', agreementTime(a.time('eventStartAt'))),
          Text(
            a.depositEligible
                ? 'Deposit option available'
                : 'Full payment required',
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
          row('Total service amount', agreementMoney(a.gross)),
          row('Required upfront payment', agreementMoney(a.upfront)),
          row('Remaining balance', agreementMoney(a.remaining)),
          if (a.depositEligible || a.eligibilityReason == 'short_notice')
            row(
              'Deposit eligibility cutoff',
              agreementTime(a.time('depositEligibilityCutoffAt')),
            ),
          Text(
            a.depositEligible
                ? 'Submit at least 72 hours before the event to keep the deposit option. Deposit eligibility is finalized on submission. Review again if the cutoff passes.'
                : a.eligibilityReason == 'short_notice'
                ? 'Full payment is required because the 72-hour deposit eligibility cutoff has passed.'
                : "Full payment is required under this service's saved payment policy.",
          ),
          if (a.depositEligible)
            row(
              'Remaining balance becomes due',
              agreementTime(a.time('remainingBalanceDueAt')),
            ),
          row(
            'Final payment deadline',
            agreementTime(a.time('hardPaymentDeadlineAt')),
          ),
          row(
            'Preparation Period begins',
            agreementTime(a.time('preparationStartsAt')),
          ),
          const Text(
            'Preparation begins once the booking is fully paid and clear. The event enters In Progress at its scheduled start when clear. The provider confirms completion.',
          ),
          if (a.allocation != null) ...[
            const SizedBox(height: 12),
            Text(
              'Failure to Pay Remaining Balance',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const Text(
              'If the remaining balance is not settled by the final payment deadline, the booking will be automatically cancelled and will not enter the Preparation Period. A payment started before the deadline may await final confirmation.',
            ),
            row(
              'Refund to you',
              agreementMoney(
                a.allocation!['customerDefaultRefundAmountInCentavos']!,
              ),
            ),
            row(
              'Provider reservation compensation',
              agreementMoney(
                a.allocation!['providerReservationCompAmountInCentavos']!,
              ),
            ),
            row(
              'FEASTA cancellation/platform fee',
              agreementMoney(
                a.allocation!['feastaCancellationFeeAmountInCentavos']!,
              ),
            ),
            const Text(
              'This payment-default rule is separate from the Cancellation Refund Policy.',
            ),
          ],
          CheckboxListTile(
            key: ValueKey('agreement-${a.providerId}'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: acknowledged,
            onChanged: onChanged,
            title: const Text(
              "I have reviewed and agree to this provider's Booking & Payment Agreement shown above.",
            ),
          ),
        ],
      ),
    );
  }
}
