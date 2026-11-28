import '../../../shared/models/customer_event_list.dart';

enum EventListCatalogStatus {
  notChecked,
  checking,
  eligible,
  unavailable,
  couldNotVerify,
  priceUnavailable;

  String get message => switch (this) {
    notChecked => 'Latest package details not checked',
    checking => 'Checking latest package details',
    eligible => 'Latest package details verified',
    unavailable => 'This package is currently unavailable for selection',
    couldNotVerify =>
      "We couldn't verify the latest package details. Please try again.",
    priceUnavailable => 'Latest listed price unavailable.',
  };
}

class EventListCatalogResult {
  const EventListCatalogResult(this.status, {this.latestPrice});
  final EventListCatalogStatus status;
  final double? latestPrice;
  bool priceChanged(CustomerEventListEntry entry) =>
      entry.estimatedPrice != null &&
      latestPrice != null &&
      entry.estimatedPrice != latestPrice;
}

class EventListProviderGroup {
  EventListProviderGroup(
    this.providerId,
    this.providerName,
    Iterable<CustomerEventListEntry> entries,
  ) : entries = List.unmodifiable(entries);
  final String providerId, providerName;
  final List<CustomerEventListEntry> entries;
}

/// Pure presentation of verified snapshots; no catalog or storage access.
List<EventListProviderGroup> groupEventList(CustomerEventList list) {
  final groups = <String, List<CustomerEventListEntry>>{};
  for (final entry in list.entries) {
    (groups[entry.providerId] ??= []).add(entry);
  }
  return List.unmodifiable(
    groups.entries.map(
      (group) => EventListProviderGroup(
        group.key,
        group.value.first.providerName,
        group.value,
      ),
    ),
  );
}
