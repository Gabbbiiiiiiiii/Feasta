import 'package:flutter/material.dart';

import '../../core/widgets/widgets.dart';
import 'booking_agreement_controller.dart';

/// Displays server disclosure amounts; never derives payment eligibility locally.
class BookingPaymentRequirement extends StatelessWidget {
  const BookingPaymentRequirement({
    required this.controller,
    this.onRetry,
    super.key,
  });

  final BookingAgreementController controller;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) => FeastaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Payment requirement for this request',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          if (controller.status == AgreementReviewStatus.ready)
            for (final agreement in controller.agreements) ...[
              Text(agreement.providerName),
              Text(
                agreement.depositEligible
                    ? 'Deposit currently available'
                    : 'Full payment required',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              Text(FeastaPriceFormatter.format(agreement.upfront / 100)),
              if (agreement.depositEligible)
                Text(
                  'Remaining balance: ${FeastaPriceFormatter.format(agreement.remaining / 100)}. Eligibility is finalized on submission.',
                )
              else if (agreement.eligibilityReason == 'short_notice')
                const Text(
                  'The 72-hour deposit cutoff has passed for this event.',
                ),
              const SizedBox(height: 12),
            ]
          else ...[
            Text(
              controller.message ??
                  'Checking current booking-specific payment requirements...',
            ),
            if (controller.status == AgreementReviewStatus.failed ||
                controller.status == AgreementReviewStatus.reconciliation)
              TextButton(
                onPressed: onRetry,
                child: const Text('Retry payment requirements'),
              ),
          ],
          const Text(
            'The detailed agreement below shows all deadlines. Payment is not collected by submitting this request.',
          ),
        ],
      ),
    ),
  );
}
