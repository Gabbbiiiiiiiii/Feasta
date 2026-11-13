import 'dart:async';
import '../../../core/theme/app_colors.dart';
import '../customization_session.dart';
import 'package:flutter/material.dart';
import '../../../shared/models/feasta_models.dart';
import '../../../core/widgets/badges/feasta_price_text.dart';

class EventServicesSelection extends StatefulWidget {
  const EventServicesSelection({
    super.key,
    this.session,
    required this.providerName,
    required this.providerId,
    required this.catering,
    required this.marketplace,
    required this.selected,
    required this.onToggle,
    required this.check,
    this.expanded = false,
  });
  final CustomizationSession? session;
  final String providerName, providerId;
  final Stream<List<AddonModel>> catering, marketplace;
  final List<Map<String, dynamic>> selected;
  final void Function(String, AddonModel?, bool) onToggle;
  final Future<({bool available, String message})> Function(AddonModel) check;
  final bool expanded;
  @override
  State<EventServicesSelection> createState() => _EventServicesSelectionState();
}

class _EventServicesSelectionState extends State<EventServicesSelection> {
  late Stream<List<AddonModel>> catering = _replayCatalog(widget.catering);
  late Stream<List<AddonModel>> marketplace = _replayCatalog(
    widget.marketplace,
  );
  final checks = <AddonModel, Future<({bool available, String message})>>{};
  String query = '';
  Timer? expiry;
  @override
  void initState() {
    super.initState();
    expiry = Timer.periodic(const Duration(minutes: 4), (_) {
      if (mounted) setState(() => checks.clear());
    });
  }

  @override
  void dispose() {
    expiry?.cancel();
    super.dispose();
  }

  Widget group(
    String title,
    AsyncSnapshot<List<AddonModel>> snapshot,
    bool own,
  ) {
    final services = (snapshot.data ?? [])
        .where(
          (a) =>
              [
                a.name,
                a.providerBusinessName,
                a.category,
              ].any((value) => value.toLowerCase().contains(query)) &&
              a.isActive &&
              a.isAvailable &&
              a.price.isFinite &&
              a.price >= 0 &&
              (own
                  ? a.providerId == widget.providerId
                  : a.providerId != widget.providerId),
        )
        .toList();
    if (own && !snapshot.hasError && services.isEmpty) {
      return const SizedBox.shrink();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: AppColors.primary,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        if (snapshot.hasError)
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Services could not be loaded.'),
              TextButton(
                onPressed: () => setState(() {
                  if (own) {
                    catering = _replayCatalog(widget.catering);
                  } else {
                    marketplace = _replayCatalog(widget.marketplace);
                  }
                  checks.clear();
                }),
                child: Text('Retry $title'),
              ),
            ],
          )
        else if (snapshot.connectionState == ConnectionState.waiting)
          const LinearProgressIndicator()
        else if (services.isEmpty)
          const Text('No eligible services are currently available.')
        else
          ...services.map(card),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget card(AddonModel addon) {
    final selected = widget.selected.any((a) => a['addonId'] == addon.id);

    return FutureBuilder<({bool available, String message})>(
      future: checks.putIfAbsent(addon, () => widget.check(addon)),
      builder: (context, snapshot) {
        final available = snapshot.data?.available == true;
        final selectedCount = widget.selected
            .map((a) => a['addonId'])
            .toSet()
            .length;
        final canToggle = selected || (available && selectedCount < 20);

        final leadDays = addon.bookingLeadTimeDays ?? 0;

        String statusMessage = snapshot.hasError
            ? 'Availability could not be verified.'
            : (selected && snapshot.data?.available == false
                  ? 'Selected, but no longer available. ${snapshot.data!.message}'
                  : snapshot.data?.message ??
                        'Checking availability for your event...');

        // Keep the authoritative availability result while avoiding
        // repetition of the separately displayed advance-booking notice.
        if (leadDays > 0 && available) {
          statusMessage = statusMessage
              .replaceAll(
                RegExp(
                  'Requires booking at least $leadDays days in advance\\.?(?=\\s|\$)',
                  caseSensitive: false,
                ),
                '',
              )
              .trim();
        }

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 0,
          color: Colors.white,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFFE0E7E3)),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 2,
                child: addon.imageUrl?.trim().isNotEmpty == true
                    ? Image.network(
                        addon.imageUrl!,
                        fit: BoxFit.cover,
                        excludeFromSemantics: true,
                        errorBuilder: (_, _, _) =>
                            const _ServiceImageFallback(),
                      )
                    : const _ServiceImageFallback(),
              ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Checkbox(
                          semanticLabel:
                              'Select ${addon.name} from ${addon.providerBusinessName}',
                          value: selected,
                          onChanged: canToggle
                              ? (value) {
                                  widget.onToggle(
                                    addon.id,
                                    addon,
                                    value == true,
                                  );
                                  setState(() {});
                                }
                              : null,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                addon.name,
                                style: Theme.of(context).textTheme.titleSmall
                                    ?.copyWith(
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primary,
                                    ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                addon.providerBusinessName,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (leadDays > 0) ...[
                      const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.warning_amber_rounded,
                            size: 17,
                            color: Color(0xFFB66A3C),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Requires booking at least $leadDays days in advance.',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: const Color(0xFFB66A3C)),
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (addon.description.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        addon.description,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                    if (statusMessage.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          statusMessage,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    ],
                    if (snapshot.hasError)
                      TextButton(
                        onPressed: () {
                          setState(() {
                            checks.remove(addon);
                          });
                        },
                        child: const Text('Retry availability'),
                      ),
                    const SizedBox(height: 12),
                    const Divider(height: 1),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            addon.category,
                            style: Theme.of(context).textTheme.labelSmall,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            FeastaPriceFormatter.format(addon.price),
                            textAlign: TextAlign.end,
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final count = widget.selected.map((a) => a['addonId']).toSet().length;
    final subtotal = widget.selected.fold<double>(
      0,
      (sum, a) => sum + ((a['price'] as num?)?.toDouble() ?? 0),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$count ${count == 1 ? 'service' : 'services'} selected',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        if (widget.expanded)
          TextField(
            decoration: const InputDecoration(
              labelText: 'Search services',
              hintText: 'Name, provider, or category',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (value) =>
                setState(() => query = value.trim().toLowerCase()),
          ),
        if (count >= 20)
          const Text(
            '20-service limit reached. Remove a service to choose another.',
          ),
        StreamBuilder<List<AddonModel>>(
          key: ValueKey(catering),
          stream: catering,
          builder: (_, s) => group('From ${widget.providerName}', s, true),
        ),
        StreamBuilder<List<AddonModel>>(
          key: ValueKey(marketplace),
          stream: marketplace,
          builder: (_, s) => group('Other FEASTA event services', s, false),
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFFF7F9F8),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE0E7E3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'SELECTED SERVICES',
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                '$count optional ${count == 1 ? 'service' : 'services'}',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              if (count == 0) ...[
                const SizedBox(height: 4),
                Text(
                  'No event services selected.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              if (widget.selected.isNotEmpty) ...[
                const SizedBox(height: 10),
                ...widget.selected.toList().map(
                  (a) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(a['name']?.toString() ?? 'Service'),
                    subtitle: Text(a['providerBusinessName']?.toString() ?? ''),
                    trailing: IconButton(
                      tooltip: 'Remove ${a['name']}',
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        widget.onToggle(a['addonId'] as String, null, false);
                        setState(() {});
                      },
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Text(
                'Event services are optional. You can continue without selecting any.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              Text(
                'Displayed prices are for planning only. FEASTA revalidates availability and pricing when your booking is submitted.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
              const SizedBox(height: 8),
              const Divider(height: 1),
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      'Displayed add-ons subtotal',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Flexible(
                    child: Text(
                      FeastaPriceFormatter.format(subtotal),
                      textAlign: TextAlign.end,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// Share the source and replay its latest catalog when the browser opens.
Stream<List<AddonModel>> _replayCatalog(Stream<List<AddonModel>> source) {
  List<AddonModel>? latest;
  final shared = source
      .map((data) {
        latest = data;
        return data;
      })
      .asBroadcastStream(onCancel: (subscription) => subscription.cancel());
  return Stream<List<AddonModel>>.multi((controller) {
    final subscription = shared.listen(
      controller.addSync,
      onError: controller.addErrorSync,
      onDone: controller.closeSync,
    );
    if (latest != null) controller.addSync(latest!);
    controller.onCancel = subscription.cancel;
  });
}

class _ServiceImageFallback extends StatelessWidget {
  const _ServiceImageFallback();
  @override
  Widget build(BuildContext context) => const ColoredBox(
    color: AppColors.primarySubtle,
    child: Center(child: Icon(Icons.event_outlined, color: AppColors.primary)),
  );
}
