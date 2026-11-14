import 'dart:convert';
import 'event_customization_data.dart';
import 'booking_contract.dart';

/// A short-lived precheck, never a reservation. Submission revalidates on server.
class CustomerAvailability {
  CustomerAvailability.parse(
    dynamic data, {
    required this.uid,
    required this.packageId,
    required this.providerId,
    required EventCustomizationData customization,
    DateTime? checkedAt,
  }) : selection = _identity(packageId, customization),
       checkedAt = checkedAt ?? DateTime.now() {
    final expected = {
      providerId,
      ...customization.selectedAddOns.map((a) => a['providerId']),
    };
    if (data is! Map || data['results'] is! List) {
      throw const FormatException('Invalid availability response.');
    }
    final seen = <String>{};
    final messages = <String>[];
    var allAvailable = true;
    for (final row in data['results'] as List) {
      if (row is! Map ||
          row['providerId'] is! String ||
          !expected.contains(row['providerId']) ||
          !seen.add(row['providerId'] as String) ||
          row['available'] is! bool ||
          !row.containsKey('reasonCode') ||
          row['message'] is! String ||
          (row['message'] as String).trim().isEmpty ||
          (row['available'] == true
              ? row['reasonCode'] != null
              : row['reasonCode'] is! String ||
                    (row['reasonCode'] as String).isEmpty)) {
        throw const FormatException('Invalid availability response.');
      }
      allAvailable = allAvailable && row['available'] == true;
      messages.add(row['message'] as String);
    }
    if (seen.length != expected.length) {
      throw const FormatException('Incomplete availability response.');
    }
    available = allAvailable;
    message = messages.toSet().join('\n');
  }

  final String uid, packageId, providerId, selection;
  final DateTime checkedAt;
  late final bool available;
  late final String message;

  bool permits(
    String? currentUid,
    String package,
    String provider,
    EventCustomizationData customization,
  ) {
    final age = DateTime.now().difference(checkedAt);
    return available &&
        uid == currentUid &&
        packageId == package &&
        providerId == provider &&
        age >= Duration.zero &&
        age < const Duration(minutes: 5) &&
        selection == _identity(package, customization);
  }

  static String _identity(String package, EventCustomizationData c) =>
      jsonEncode({
        ...request(package, c),
        'revision': c.expectedPackageRevision,
        'contractVersion': c.sharedContractVersion,
        'tier': c.serviceTier,
        'theme': c.packageThemeId,
        'foodChoices': c.foodChoiceSelections,
        'foods': c.selectedFoods,
        'decorations': c.selectedDecorations,
        'furniture': c.selectedFurniture,
        'addons': c.selectedAddOns,
        'type': c.eventType,
        'location': c.eventLocation,
        'address': c.eventAddress,
        'ownAddons': c.willArrangeOwnAddOns,
        'ownAddonsNote': c.customerArrangedAddOnsNote,
        'specialRequest': c.specialRequest,
      });

  static Map<String, dynamic> request(
    String packageId,
    EventCustomizationData c,
  ) => {
    'packageId': packageId,
    'addonIds': c.selectedAddOns.map((a) => a['addonId']).toSet().toList(),
    'eventDate':
        '${c.eventDate.year.toString().padLeft(4, '0')}-${c.eventDate.month.toString().padLeft(2, '0')}-${c.eventDate.day.toString().padLeft(2, '0')}',
    'eventTime': bookingTime(c.eventTime),
    'eventEndTime': bookingTime(c.eventEndTime),
    'guestCount': c.guestCount,
  };
}
