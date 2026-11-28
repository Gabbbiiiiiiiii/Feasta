import 'package:flutter_test/flutter_test.dart';

import 'package:feasta/shared/models/booking_contract.dart';
import 'package:feasta/shared/models/event_customization_data.dart';

// A calendar picker value in UTC+08:00, independent of the host timezone.
// Only the DateTime operations consumed by the serializer are implemented.
class ManilaPickerDate extends Fake implements DateTime {
  final _wall = DateTime.utc(2030, 1, 2);
  @override
  int get year => _wall.year;
  @override
  int get month => _wall.month;
  @override
  int get day => _wall.day;
  @override
  bool get isUtc => false;
  @override
  Duration get timeZoneOffset => const Duration(hours: 8);
  @override
  DateTime toUtc() => _wall.subtract(timeZoneOffset);
}

Map<String, dynamic> payload({
  String address = 'Street',
  int guests = 50,
  List<String> foods = const ['Rice'],
  List<String> decorations = const [],
  List<String> furniture = const [],
  bool own = false,
  String ownNotes = '',
  String? tier = 'full_service',
  String? theme = 'garden',
  String endTime = '18:00',
  List<Map<String, dynamic>> addons = const [],
  String notes = '',
  String time = '2:05 PM',
  DateTime? date,
}) => BookingSelection(
  providerId: 'provider_123',
  packageId: 'package_123',
  customization: EventCustomizationData(
    eventType: ' Birthday ',
    eventDate: date ?? DateTime(2030, 1, 2),
    eventTime: time,
    eventEndTime: endTime,
    guestCount: guests,
    eventLocation: 'Ormoc City',
    eventAddress: address,
    selectedFoods: foods,
    selectedDecorations: decorations,
    selectedFurniture: furniture,
    selectedAddOns: addons,
    willArrangeOwnAddOns: own,
    customerArrangedAddOnsNote: ownNotes,
    specialRequest: notes,
    serviceTier: tier,
    packageThemeId: theme,
  ),
).toJson(clientRequestId: 'request_123');

void main() {
  test(
    'Manila picker midnight retains day despite previous UTC calendar day',
    () {
      final selected = ManilaPickerDate();
      expect(selected.timeZoneOffset, const Duration(hours: 8));
      expect(selected.toUtc().toIso8601String(), '2030-01-01T16:00:00.000Z');
      expect(payload(date: selected)['eventDate'], '2030-01-02');
      // The original transport would send the previous UTC day / timestamp.
      expect(
        payload(date: selected)['eventDate'],
        isNot(selected.toUtc().toIso8601String().substring(0, 10)),
      );
    },
  );
  test(
    'populated selections survive and untrusted add-on fields stay excluded',
    () {
      final baseline = payload();
      final data = payload(
        foods: [' Rice ', 'Fish'],
        decorations: [' Flowers ', 'Lights'],
        furniture: ['Tables', 'Chairs'],
        addons: [
          {
            'addonId': 'addon_123',
            'latitude': 11,
            'longitude': 124,
            'coordinates': {'lat': 11},
            'price': 99,
            'totalAmount': 999,
            'paymentPolicy': 'full_payment',
            'downPaymentPercentage': 100,
            'financialSnapshot': {'grossAmountInCentavos': 999},
          },
          {'addonId': 'addon_456', 'GeoPoint': 'unsupported'},
        ],
        own: true,
        ownNotes: ' Family DJ ',
        notes: ' No peanuts ',
      );
      expect(data, {
        ...baseline,
        'selectedFoods': ['Rice', 'Fish'],
        'selectedDecorations': ['Flowers', 'Lights'],
        'selectedFurniture': ['Tables', 'Chairs'],
        'addonIds': ['addon_123', 'addon_456'],
        'willArrangeOwnAddOns': true,
        'customerArrangedAddOnsNote': 'Family DJ',
        'specialRequest': 'No peanuts',
      });
    },
  );
  test('legacy package omits absent tier and theme; supported tiers pass', () {
    final data = payload(tier: null, theme: null);
    expect(data.containsKey('serviceTier'), isFalse);
    expect(data.containsKey('packageThemeId'), isFalse);
    for (final tier in ['buffet_setup', 'full_service']) {
      expect(payload(tier: tier)['serviceTier'], tier);
      expect(payload(tier: tier)['packageThemeId'], 'garden');
    }
    expect(payload(tier: 'drop_off', theme: null)['serviceTier'], 'drop_off');
  });
  test('invalid tiers and unsupported themes fail locally', () {
    for (final build in [
      () => payload(tier: 'unknown'),
      () => payload(theme: 'x'),
      () => payload(theme: 'garden/theme'),
      () => payload(theme: 'x' * 81),
      () => payload(tier: 'drop_off'),
      () => payload(tier: null),
    ]) {
      expect(build, throwsFormatException);
    }
  });
  test('duplicate add-on IDs are trimmed and collapsed as on the backend', () {
    expect(
      payload(
        addons: [
          {'addonId': 'addon_123'},
          {'addonId': ' addon_123 '},
          {'addonId': 'addon_456'},
        ],
      )['addonIds'],
      ['addon_123', 'addon_456'],
    );
  });
  test('equal start and end times are rejected', () {
    expect(
      () => payload(time: '6:00 PM', endTime: '18:00'),
      throwsFormatException,
    );
  });
  test(
    'calendar date, canonical times, tier, theme and allowlisted fields',
    () {
      final data = payload(
        date: DateTime.utc(2030, 1, 2),
        addons: [
          {'addonId': 'addon_123', 'price': 999, 'latitude': 1},
        ],
      );
      expect(data, {
        'clientRequestId': 'request_123',
        'providerId': 'provider_123',
        'packageId': 'package_123',
        'cateringSelectionType': 'package',
        'serviceTier': 'full_service',
        'packageThemeId': 'garden',
        'eventType': 'birthday',
        'eventDate': '2030-01-02',
        'eventTime': '14:05',
        'eventEndTime': '18:00',
        'guestCount': 50,
        'eventLocation': 'Ormoc City',
        'eventAddress': 'Street',
        'selectedFoods': ['Rice'],
        'selectedDecorations': [],
        'selectedFurniture': [],
        'addonIds': ['addon_123'],
        'willArrangeOwnAddOns': false,
        'customerArrangedAddOnsNote': '',
        'specialRequest': '',
      });
    },
  );
  test('time boundaries and invalid times', () {
    expect(bookingTime('12:00 AM'), '00:00');
    expect(bookingTime('12:00 PM'), '12:00');
    expect(bookingTime('9:05'), '09:05');
    for (final time in ['24:00', '13:00 PM', '00:60', 'noon']) {
      expect(() => bookingTime(time), throwsFormatException);
    }
  });
  test('backend size limits and missing add-on IDs fail closed', () {
    expect(
      payload(address: 'a' * 500, notes: 'n' * 1000, guests: 10000),
      isNotEmpty,
    );
    for (final build in [
      () => payload(address: 'a' * 501),
      () => payload(notes: 'n' * 1001),
      () => payload(guests: 10001),
      () => payload(foods: List.filled(51, 'Rice')),
      () => payload(foods: ['a' * 121]),
      () => payload(addons: [{}]),
      () => payload(addons: List.generate(21, (i) => {'addonId': 'addon_$i'})),
      () => payload(time: '19:00'),
    ]) {
      expect(build, throwsFormatException);
    }
  });
  test(
    'strict response accepts created and replay, rejects malformed fields',
    () {
      final valid = <String, dynamic>{
        'bookingId': 'booking_123',
        'mainEventId': 'booking_123',
        'providerRequestIds': ['request_123'],
        'created': true,
      };
      for (final created in [true, false]) {
        final result = BookingSubmissionResult.fromJson({
          ...valid,
          'created': created,
        });
        expect(result.created, created);
        expect(
          () => result.providerRequestIds.add('another_123'),
          throwsUnsupportedError,
        );
      }
      for (final key in valid.keys) {
        expect(
          () => BookingSubmissionResult.fromJson({...valid}..remove(key)),
          throwsFormatException,
        );
      }
      for (final change in [
        {'created': 'true'},
        {'bookingId': 123},
        {'mainEventId': ' '},
        {'providerRequestIds': []},
        {
          'providerRequestIds': [123],
        },
        {
          'providerRequestIds': ['request_123', 'request_123'],
        },
      ]) {
        expect(
          () => BookingSubmissionResult.fromJson({...valid, ...change}),
          throwsFormatException,
        );
      }
      expect(
        () => BookingSubmissionResult.fromJson(null),
        throwsFormatException,
      );
    },
  );
}
