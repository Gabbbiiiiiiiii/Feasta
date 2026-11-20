import 'package:flutter/material.dart';
import '../../../core/helpers/booking_preparation.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';
import '../../../shared/models/feasta_models.dart';

String preparationEstimateText(
  PackageModel package,
  List<Map<String, dynamic>> addons, {
  String? serviceTier,
  int? guests,
}) {
  final services = preparationServices(package);
  if (services.isNotEmpty && !services.containsKey(serviceTier)) {
    return 'Choose a service to see your estimate';
  }
  final total = preparationEstimate(
    package,
    addons,
    serviceTier: serviceTier,
    guests: guests,
  );
  return total == null
      ? 'Estimate unavailable - published pricing needs confirmation'
      : 'Known estimate: ${FeastaPriceFormatter.format(total)}';
}

class BookingPreparationPrice extends StatelessWidget {
  const BookingPreparationPrice({
    required this.package,
    required this.addons,
    this.serviceTier,
    this.guests,
    this.hasUnconfirmedRequests = false,
    super.key,
  });
  final PackageModel package;
  final List<Map<String, dynamic>> addons;
  final String? serviceTier;
  final int? guests;
  final bool hasUnconfirmedRequests;
  @override
  Widget build(BuildContext context) {
    final services = preparationServices(package);
    final base = preparationEstimate(
      package,
      const [],
      serviceTier: serviceTier,
      guests: guests,
    );
    final needsSelection =
        services.isNotEmpty && !services.containsKey(serviceTier);
    String money(dynamic value) => value is num && knownPreparationPrice(value)
        ? FeastaPriceFormatter.format(value)
        : 'Published price unavailable';
    return FeastaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Price estimate',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            package.name,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          _PriceRow(
            label: services.isEmpty
                ? 'Published package price'
                : 'Selected service: ${services.containsKey(serviceTier) ? serviceOptionTitle(serviceTier!, services[serviceTier]!) : 'Choose a service option'}',
            value: needsSelection ? 'Selection required' : money(base),
          ),
          if (guests != null && guests! > 0)
            _PriceRow(label: 'Guests', value: '$guests'),
          if (addons.isEmpty)
            const _PriceRow(
              label: 'Additional priced services',
              value: 'None selected',
            ),
          for (final addon in addons)
            _PriceRow(
              label: (addon['name'] ?? 'Add-on').toString(),
              value: money(addon['price']),
            ),
          const Divider(),
          Text(
            preparationEstimateText(
              package,
              addons,
              serviceTier: serviceTier,
              guests: guests,
            ),
            textAlign: TextAlign.end,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          if (hasUnconfirmedRequests)
            const Text(
              'Customer-arranged services and special requests: costs unconfirmed and excluded from the known estimate.',
            ),
          if (package.paymentPolicy == 'deposit_then_balance' ||
              package.paymentPolicy == 'full_payment') ...[
            const SizedBox(height: 12),
            DecoratedBox(
              decoration: BoxDecoration(
                color: AppColors.secondary,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.primary.withValues(alpha: 0.15),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Payment terms',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        child: Text(
                          package.paymentPolicy == 'full_payment'
                              ? 'Full payment'
                              : 'Deposit + balance',
                          style: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(
                                color: AppColors.primaryStrong,
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                      ),
                    ),
                    if (package.paymentPolicy == 'full_payment') ...[
                      const SizedBox(height: 8),
                      Text(
                        '100% due after booking acceptance',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.secondaryText,
                        ),
                      ),
                    ] else ...[
                      _PaymentTermFact(
                        label: 'Deposit',
                        detail:
                            package.depositPercentage != null &&
                                package.depositPercentage!.isFinite &&
                                package.depositPercentage! >= 0 &&
                                package.depositPercentage! <= 100
                            ? 'Pay ${package.depositPercentage!.toStringAsFixed(2).replaceFirst(RegExp(r"\.?0+$"), "")}% first, then the remaining balance'
                            : 'Pay a deposit first, then the remaining balance',
                      ),
                      if (package.paymentTermsSchemaVersion == 2)
                        const _PaymentTermFact(
                          label: 'Balance due',
                          detail:
                              'Remaining balance is due 24 hours before the event',
                        )
                      else if (package.balanceDueHoursBeforeEvent != null &&
                          package.balanceDueHoursBeforeEvent! > 0)
                        _PaymentTermFact(
                          label: 'Balance due',
                          detail:
                              'Remaining balance is due ${package.balanceDueHoursBeforeEvent} hours before the event',
                        )
                      else if (package.balanceDueDaysBeforeEvent != null &&
                          package.balanceDueDaysBeforeEvent! > 0)
                        _PaymentTermFact(
                          label: 'Balance due',
                          detail:
                              'Remaining balance is due ${package.balanceDueDaysBeforeEvent} days before the event',
                        ),
                      const _PaymentTermFact(
                        label: 'Short notice',
                        detail: 'Under 72 hours: full payment required',
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 8),
          const Text(
            'Based on published prices for selected services. This is not a confirmed whole-event total. Final charges and availability are subject to booking confirmation.',
          ),
        ],
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(flex: 3, child: Text(label, softWrap: true)),
          const SizedBox(width: 12),
          Flexible(
            flex: 2,
            child: Align(
              alignment: Alignment.centerRight,
              child: Text(value, textAlign: TextAlign.end, softWrap: true),
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentTermFact extends StatelessWidget {
  const _PaymentTermFact({required this.label, required this.detail});

  final String label;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.labelLarge?.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            detail,
            style: theme.bodySmall?.copyWith(color: AppColors.secondaryText),
          ),
        ],
      ),
    );
  }
}
