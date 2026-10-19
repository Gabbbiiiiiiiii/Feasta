import 'event_customization_data.dart';

/// Package selection only; no prices, coordinates, or policy consent authority.
/// The server revalidates availability, ownership, terms and all amounts.
class BookingSelection {
  BookingSelection({
    required this.providerId,
    required this.packageId,
    required this.customization,
  });
  final String providerId;
  final String packageId;
  final EventCustomizationData customization;

  Map<String, dynamic> toJson({required String clientRequestId}) {
    final d = customization;
    String text(String value, int max, {bool required = false}) {
      final result = value.trim();
      if (result.length > max || (required && result.isEmpty)) {
        throw const FormatException('Invalid booking selection text.');
      }
      return result;
    }

    String id(String value) {
      final result = text(value, 160, required: true);
      if (!RegExp(r'^[A-Za-z0-9_-]{8,160}$').hasMatch(result)) {
        throw const FormatException('Invalid booking selection ID.');
      }
      return result;
    }

    List<String> choices(List<String> values, int count, int length) {
      if (values.length > count) {
        throw const FormatException('Too many booking selections.');
      }
      return values.map((v) => text(v, length, required: true)).toList();
    }

    final type = d.eventType.trim().toLowerCase();
    if (!const [
          'birthday',
          'wedding',
          'debut',
          'anniversary',
          'reunion',
          'corporate',
          'baptism',
          'graduation',
          'other',
        ].contains(type) ||
        d.guestCount < 1 ||
        d.guestCount > 10000) {
      throw const FormatException('Invalid event type or guest count.');
    }
    final start = bookingTime(d.eventTime);
    final end = bookingTime(d.eventEndTime);
    if (end.compareTo(start) <= 0) {
      throw const FormatException('Event end must follow start.');
    }
    if (d.serviceTier != null &&
        !const [
          'drop_off',
          'buffet_setup',
          'full_service',
        ].contains(d.serviceTier)) {
      throw const FormatException('Invalid service tier.');
    }
    if (d.packageThemeId != null &&
        (!RegExp(r'^[A-Za-z0-9_-]{2,80}$').hasMatch(d.packageThemeId!) ||
            !const ['buffet_setup', 'full_service'].contains(d.serviceTier))) {
      throw const FormatException('Invalid package theme.');
    }
    final addons = <String>[];
    for (final addon in d.selectedAddOns) {
      final value = addon['addonId'];
      if (value is! String) {
        throw const FormatException('Missing add-on ID.');
      }
      addons.add(text(value, 160, required: true));
    }
    final date = d.eventDate;
    return {
      'clientRequestId': id(clientRequestId),
      'providerId': id(providerId), 'packageId': id(packageId),
      'cateringSelectionType': 'package',
      if (d.serviceTier != null) 'serviceTier': d.serviceTier,
      if (d.packageThemeId != null) 'packageThemeId': d.packageThemeId,
      'eventType': type,
      // A calendar day in Manila, independent of the device timezone.
      'eventDate':
          '${date.year.toString().padLeft(4, "0")}-${date.month.toString().padLeft(2, "0")}-${date.day.toString().padLeft(2, "0")}',
      'eventTime': start, 'eventEndTime': end,
      'guestCount': d.guestCount,
      'eventLocation': text(d.eventLocation, 180, required: true),
      'eventAddress': text(d.eventAddress, 500, required: true),
      'selectedFoods': choices(d.selectedFoods, 50, 120),
      'selectedDecorations': choices(d.selectedDecorations, 50, 120),
      'selectedFurniture': choices(d.selectedFurniture, 50, 120),
      'addonIds': choices(addons, 20, 160).toSet().toList(),
      'willArrangeOwnAddOns': d.willArrangeOwnAddOns,
      'customerArrangedAddOnsNote': text(d.customerArrangedAddOnsNote, 500),
      'specialRequest': text(d.specialRequest, 1000),
    };
  }
}

/// Accepts existing display snapshots as well as canonical 24-hour times.
String bookingTime(String value) {
  final match = RegExp(
    r'^(\d{1,2}):(\d{2})(?: (AM|PM))?$',
  ).firstMatch(value.trim());
  if (match == null) throw const FormatException('Invalid event time.');
  var hour = int.parse(match[1]!);
  final minute = int.parse(match[2]!);
  final period = match[3];
  if (minute > 59 || (period == null ? hour > 23 : hour < 1 || hour > 12)) {
    throw const FormatException('Invalid event time.');
  }
  if (period != null) hour = hour % 12 + (period == 'PM' ? 12 : 0);
  return '${hour.toString().padLeft(2, "0")}:${minute.toString().padLeft(2, "0")}';
}

class BookingSubmissionResult {
  BookingSubmissionResult._(
    this.bookingId,
    this.mainEventId,
    this.providerRequestIds,
    this.created,
  );
  final String bookingId;
  final String mainEventId;
  final List<String> providerRequestIds;
  final bool created;

  factory BookingSubmissionResult.fromJson(Object? value) {
    bool validId(Object? v) =>
        v is String && RegExp(r'^[A-Za-z0-9_-]{8,160}$').hasMatch(v);
    if (value is! Map ||
        !validId(value['bookingId']) ||
        !validId(value['mainEventId']) ||
        value['created'] is! bool ||
        value['providerRequestIds'] is! List) {
      throw const FormatException('Invalid booking response.');
    }
    final ids = value['providerRequestIds'] as List;
    if (ids.isEmpty ||
        !ids.every(validId) ||
        ids.toSet().length != ids.length) {
      throw const FormatException('Invalid provider request references.');
    }
    return BookingSubmissionResult._(
      value['bookingId'] as String,
      value['mainEventId'] as String,
      List<String>.unmodifiable(ids),
      value['created'] as bool,
    );
  }
}
