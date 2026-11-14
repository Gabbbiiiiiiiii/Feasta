import 'dart:convert';
import '../../../shared/models/customer_event_list.dart';
import '../../../shared/models/provider_calendar_month.dart';

Map<String, dynamic> sharedEventDetails(CustomerEventListEvent event) =>
    Map.of(event.toJson())..remove('specialRequest');

/// Keep every distinct plan visible; never choose a conflicting plan implicitly.
List<CustomerEventListEntry> sharedEventCandidates(
  Iterable<CustomerEventListEntry> entries,
  String providerId,
) {
  final seen = <String>{};
  return entries.where((entry) {
    final event = entry.configuration?.event;
    return entry.providerId != providerId &&
        event != null &&
        seen.add(jsonEncode(sharedEventDetails(event)));
  }).toList();
}

Map<String, dynamic> compatibleSharedEvent(
  CustomerEventListEvent event, {
  required List<String> eventTypes,
  required int minimum,
  int? maximum,
  required DateTime now,
}) {
  final futureDate =
      event.eventDate.compareTo(calendarDateKey(manilaToday(now))) > 0;
  final locationValid =
      event.eventLocation.trim().toLowerCase() == 'ormoc city';
  return {
    if (eventTypes.contains(event.eventType)) 'eventType': event.eventType,
    if (futureDate) ...{
      'eventDate': event.eventDate,
      'eventTime': event.eventTime,
      'eventEndTime': event.eventEndTime,
    },
    if (event.guestCount >= minimum && event.guestCount <= (maximum ?? 10000))
      'guestCount': event.guestCount,
    if (locationValid) ...{
      'eventLocation': event.eventLocation,
      'eventAddress': event.eventAddress,
    },
  };
}
