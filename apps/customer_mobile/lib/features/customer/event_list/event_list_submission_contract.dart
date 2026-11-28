import 'dart:convert';
import '../../../shared/models/customer_event_list.dart';

Map<String, dynamic> _eventJson(CustomerEventListEvent event) => event.toJson()
  ..['eventType'] = event.eventType.trim().toLowerCase()
  ..['eventLocation'] = event.eventLocation.trim()
  ..['eventAddress'] = event.eventAddress.trim();

/// Match the existing booking transport without changing the saved snapshots.
/// Shared scheduling excludes provider-specific instructions.
bool sameEventListEvent(CustomerEventListEvent a, CustomerEventListEvent b) {
  final left = _eventJson(a)..remove('specialRequest');
  final right = _eventJson(b)..remove('specialRequest');
  return jsonEncode(left) == jsonEncode(right);
}

/// Complete list projection: never drops unsupported or unconfigured rows.
Map<String, dynamic> eventListSubmission(
  List<CustomerEventListEntry> entries,
  String requestId, {
  List<EventListIdentityRevision> currentMarketplaceMetadata = const [],
}) {
  if (entries.length < 2 || entries.length > 4) {
    throw const FormatException('Choose between 2 and 4 configured providers.');
  }
  if (entries.map((e) => e.providerId).toSet().length != entries.length) {
    throw const FormatException(
      'Choose one package per provider for this request.',
    );
  }
  final mixed = entries.any((e) => e.kind == 'marketplace_service');
  if (entries.any(
        (e) => !['catering_package', 'marketplace_service'].contains(e.kind),
      ) ||
      !entries.any((e) => e.kind == 'catering_package')) {
    throw const FormatException(
      'Choose Catering with supported event services.',
    );
  }
  for (final entry in entries.where((e) => e.kind == 'marketplace_service')) {
    final current = currentMarketplaceMetadata.where(
      (m) => m.providerId == entry.providerId && m.serviceId == entry.serviceId,
    );
    if (current.length != 1 ||
        !entry.matchesMarketplaceMetadata(
          currentProviderId: current.single.providerId,
          currentServiceId: current.single.serviceId,
          currentRevision: current.single.revision,
        )) {
      throw const FormatException(
        'Refresh marketplace service metadata before submitting.',
      );
    }
  }
  final ordered = [...entries]
    ..sort((a, b) => a.identity.key.compareTo(b.identity.key));
  final first = ordered.first.configuration;
  if (first == null || entries.any((e) => e.configuration == null)) {
    throw const FormatException(
      'Configure every package before reviewing this request.',
    );
  }
  if (entries.any(
    (e) => !sameEventListEvent(first.event, e.configuration!.event),
  )) {
    throw const FormatException(
      'Event details differ. Edit configurations to use the same event.',
    );
  }
  if (entries.any((e) => e.configuration!.selectedAddOns.isNotEmpty)) {
    throw const FormatException(
      'Coordinated add-on submission is not supported yet. Your selections remain saved.',
    );
  }
  return {
    'schemaVersion': mixed ? 2 : 1,
    'clientRequestId': eventListId(requestId),
    'event': _eventJson(first.event)..['specialRequest'] = '',
    'selections': [
      for (final entry in ordered)
        if (entry.kind == 'marketplace_service')
          {
            'kind': 'marketplace_service',
            'providerId': entry.providerId,
            'serviceId': entry.serviceId,
            'expectedRevision': entry.expectedRevision,
            'configuration': {
              'event': _eventJson(entry.configuration!.event),
              'specialRequest':
                  entry.configuration!.specialRequest ??
                  entry.configuration!.event.specialRequest,
            },
          }
        else
          {
            if (mixed) 'kind': 'catering_package',
            'providerId': entry.providerId,
            'packageId': entry.packageId,
            'configuration': entry.configuration!.toJson()
              ..['event'] = _eventJson(entry.configuration!.event)
              // Legacy packages have no versioned revision contract.
              ..['expectedPackageRevision'] =
                  entry.configuration!.sharedContractVersion == 2
                  ? entry.configuration!.expectedPackageRevision
                  : null,
          },
    ],
  };
}

/// Fresh catalog identity supplied by the caller; never derived from saved prices.
/// Step 21C must refresh these values before invoking the mixed builder.
class EventListIdentityRevision {
  const EventListIdentityRevision({
    required this.providerId,
    required this.serviceId,
    required this.revision,
  });

  final String providerId, serviceId;
  final int revision;
}
