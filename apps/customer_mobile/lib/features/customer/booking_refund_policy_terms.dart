import 'package:flutter/material.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/booking_refund_policy.dart';

/// Shared presentation of the existing authoritative disclosure.
class BookingRefundPolicyTerms extends StatelessWidget {
  const BookingRefundPolicyTerms({
    required this.policy,
    required this.acknowledged,
    required this.onChanged,
    super.key,
  });
  final BookingRefundPolicy policy;
  final bool acknowledged;
  final ValueChanged<bool?>? onChanged;
  @override
  Widget build(BuildContext context) {
    final p = policy;
    return FeastaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(p.providerName, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(
            p.sourceKind == 'package_override'
                ? 'Package-specific refund policy'
                : 'Provider refund policy',
          ),
          Text('Current applicable policy · Version ${p.policyVersion}'),
          if (p.cancellationCutoff != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFE8F1EE),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFBFD4CC)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Cancellation cutoff: ${formatCancellationCutoffDuration(p.cancellationCutoff!.cutoffHoursBeforeEvent)} before event start',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: const Color(0xFF093B26),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'New cancellation requests close ${formatCancellationCutoffDuration(p.cancellationCutoff!.cutoffHoursBeforeEvent)} before the scheduled event start (${p.cancellationCutoff!.sourceKind == 'admin_default' ? 'FEASTA default policy' : 'Provider custom policy'}).',
                  ),
                  if (p.cancellationCutoff!.guidanceNote != null) ...[
                    const SizedBox(height: 4),
                    Text(p.cancellationCutoff!.guidanceNote!),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              'Before cancellation cutoff: ${refundPercentage(p.beforeCutoffRefundBasisPoints)} refund',
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 6),
            child: Text(
              'After cancellation cutoff: 0% refund (Cancellation closed)',
            ),
          ),
          if (p.terms != null && p.terms!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'Additional policy terms',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text(p.terms!),
          ],
          CheckboxListTile(
            key: ValueKey('refund-${p.providerId}'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: acknowledged,
            onChanged: onChanged,
            title: const Text(
              "I have reviewed and acknowledge this provider's current refund policy.",
            ),
          ),
        ],
      ),
    );
  }
}
