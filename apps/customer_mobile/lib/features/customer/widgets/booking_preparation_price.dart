import 'package:flutter/material.dart';
import '../../../core/helpers/booking_preparation.dart';
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
  final total = preparationEstimate(package, addons, serviceTier: serviceTier, guests: guests);
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
    final base = preparationEstimate(package, const [], serviceTier: serviceTier, guests: guests);
    final needsSelection =
        services.isNotEmpty && !services.containsKey(serviceTier);
    String money(dynamic value) => value is num && knownPreparationPrice(value)
        ? FeastaPriceFormatter.format(value)
        : 'Published price unavailable';
    return FeastaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
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
            preparationEstimateText(package, addons, serviceTier: serviceTier, guests: guests),
          ),
          const SizedBox(height: 8),
          if (hasUnconfirmedRequests)
            const Text(
              'Customer-arranged services and special requests: costs unconfirmed and excluded from the known estimate.',
            ),
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
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: Text(label)),
        const SizedBox(width: 12),
        Flexible(child: Text(value, textAlign: TextAlign.end)),
      ],
    ),
  );
}
