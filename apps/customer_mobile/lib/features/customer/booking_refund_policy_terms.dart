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
                : 'Provider default refund policy',
          ),
          Text('Current applicable policy ? Version ${p.policyVersion}'),
          const SizedBox(height: 12),
          for (var i = 0; i < p.rules.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(
                '${refundStageLabels[i]}: ${refundPercentage(p.rules[i].refundBasisPoints)} refund rate',
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
