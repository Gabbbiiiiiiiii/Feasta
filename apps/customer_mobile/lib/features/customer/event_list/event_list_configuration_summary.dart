import 'package:flutter/material.dart';
import '../../../core/helpers/booking_preparation.dart';
import '../../../shared/models/customer_event_list.dart';
import '../../../shared/models/feasta_models.dart';
import '../../authentication/data/repositories/feasta_repository.dart';

class EventListConfigurationSummary extends StatefulWidget {
  const EventListConfigurationSummary({
    required this.entry,
    this.lookupPackage,
    this.compact = false,
    super.key,
  });
  final CustomerEventListEntry entry;
  final bool compact;
  final Future<PackageModel?> Function(String, String)? lookupPackage;
  @override
  State<EventListConfigurationSummary> createState() =>
      _EventListConfigurationSummaryState();
}

class _EventListConfigurationSummaryState
    extends State<EventListConfigurationSummary> {
  PackageModel? _package;
  Future<void> _load() async {
    final entry = widget.entry;
    try {
      final load =
          widget.lookupPackage ??
          FeastaRepository().getEligiblePackageForPreparation;
      final package = await load(entry.providerId, entry.packageId);
      if (mounted &&
          widget.entry.identity.key == entry.identity.key &&
          package?.id == entry.packageId &&
          package?.providerId == entry.providerId) {
        setState(() => _package = package);
      }
    } catch (_) {
      /* Preserve saved details even when current labels cannot be verified. */
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = widget.entry.configuration;
    if (config == null) return const Text('Needs customization');
    final foods = [...config.selectedFoods];
    for (final row in config.foodChoiceSelections) {
      for (final id in row.optionIds) {
        final groups = _package?.foodChoiceGroups.where(
          (g) => g.id == row.groupId,
        );
        foods.add(
          groups != null && groups.isNotEmpty
              ? groups.first.options[id] ?? 'Saved dish currently unavailable'
              : 'Saved dish currently unavailable',
        );
      }
    }
    final themes = _package?.themeOptions.where(
      (theme) => theme['id'] == config.packageThemeId,
    );
    final theme = config.packageThemeId == null
        ? 'None selected'
        : themes != null && themes.isNotEmpty
        ? themes.first['name'].toString()
        : 'Saved theme currently unavailable';
    Widget line(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Text('$label: $value'),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!widget.compact) const Text('Configured — revalidation required'),
        if (!widget.compact)
          Text(
            '${config.event.eventDate} · ${config.event.eventTime}–${config.event.eventEndTime} · ${config.event.guestCount} guests',
          ),
        if (!widget.compact) Text(config.event.eventLocation),
        ExpansionTile(
          title: const Text('Configuration details'),
          tilePadding: EdgeInsets.zero,
          onExpansionChanged: (open) {
            if (open) _load();
          },
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                line('Event', config.event.eventType),
                line('Date', config.event.eventDate),
                line(
                  'Time',
                  '${config.event.eventTime}–${config.event.eventEndTime}',
                ),
                line('Guests', '${config.event.guestCount}'),
                line('City / location', config.event.eventLocation),
                line('Address', config.event.eventAddress),
                line(
                  'Service level',
                  preparationServiceLabels[config.serviceTier] ??
                      'None selected',
                ),
                line(
                  'Food selections',
                  foods.isEmpty ? 'None selected' : foods.join(', '),
                ),
                line(
                  'Theme',
                  config.themeChoice == 'none' ? 'No theme needed' : theme,
                ),
                if (config.customTheme.isNotEmpty)
                  line('Custom theme request', config.customTheme),
                line(
                  'Decorations',
                  config.selectedDecorations.isEmpty
                      ? 'None selected'
                      : config.selectedDecorations.join(', '),
                ),
                line(
                  'Furniture',
                  config.selectedFurniture.isEmpty
                      ? 'None selected'
                      : config.selectedFurniture.join(', '),
                ),
                line(
                  'Event services',
                  config.selectedAddOns.isEmpty
                      ? 'None selected'
                      : config.selectedAddOns
                            .map((a) => '${a.name} — ${a.providerBusinessName}')
                            .join(', '),
                ),
                if (config.willArrangeOwnAddOns)
                  line(
                    'Customer-arranged services',
                    config.customerArrangedAddOnsNote,
                  ),
                line(
                  'Special requests',
                  config.event.specialRequest.isEmpty
                      ? 'None'
                      : config.event.specialRequest,
                ),
                line(
                  'Saved estimate',
                  config.estimatedTotal == null
                      ? 'Unknown'
                      : '₱${config.estimatedTotal!.toStringAsFixed(2)}',
                ),
                const Text(
                  'Planning snapshot only. Prices and availability must be checked again.',
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}
