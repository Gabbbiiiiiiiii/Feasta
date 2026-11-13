import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/customer_event_list.dart';

Map<String, dynamic> configuration() => {
  'event': {
    'eventType': 'wedding',
    'eventDate': '2030-06-20',
    'eventTime': '10:00',
    'eventEndTime': '12:00',
    'guestCount': 100,
    'eventLocation': 'Ormoc City',
    'eventAddress': 'Event hall',
    'specialRequest': '',
  },
  'sharedContractVersion': 2,
  'expectedPackageRevision': 3,
  'serviceTier': 'full_service',
  'packageThemeId': 'garden',
  'themeChoice': null,
  'customTheme': '',
  'foodChoiceSelections': [
    {
      'groupId': 'main',
      'optionIds': ['chicken'],
    },
  ],
  'selectedFoods': <String>[],
  'selectedDecorations': ['Flowers'],
  'selectedFurniture': ['Tables'],
  'selectedAddOns': [
    {
      'addonId': 'music',
      'providerId': 'provider_456',
      'source': 'feasta_addon_provider',
      'name': 'Music',
      'providerBusinessName': 'Band',
      'providerType': 'addon_provider',
      'category': 'Entertainment',
      'price': 500,
    },
  ],
  'willArrangeOwnAddOns': false,
  'customerArrangedAddOnsNote': '',
  'estimatedTotal': 10500,
  'pricingContext': {
    'currency': 'PHP',
    'pricingModel': 'per_pax',
    'displayedServicePrice': 100,
  },
};

CustomerEventListEntry entry([CustomerEventListConfiguration? config]) =>
    CustomerEventListEntry(
      providerId: 'provider_123',
      packageId: 'package_123',
      packageName: 'Package',
      providerName: 'Provider',
      configuration: config,
    );
CustomerEventList list(CustomerEventListEntry item) => CustomerEventList(
  ownerUid: 'customer_A',
  revision: 1,
  updatedAt: DateTime.utc(2030),
  entries: [item],
);

void main() {
  test('version-1 package-only encoding remains unchanged', () {
    final old = list(entry()).encode();
    expect(
      (jsonDecode(old)['entries'] as List).single.containsKey('configuration'),
      false,
    );
    final decoded = CustomerEventList.decode(old, ownerUid: 'customer_A');
    expect(decoded.encode(), old);
    expect(
      decoded.entries.single.readiness,
      CustomerEventListReadiness.needsCustomization,
    );
  });
  test('complete snapshot round-trips and selections are immutable', () {
    final input = configuration();
    final config = CustomerEventListConfiguration.fromJson(input);
    final raw = list(entry(config)).encode();
    final decoded = CustomerEventList.decode(raw, ownerUid: 'customer_A');
    expect(decoded.encode(), raw);
    expect(decoded.entries.single.configuration!.toJson(), input);
    expect(
      decoded.entries.single.readiness,
      CustomerEventListReadiness.configuredRevalidationRequired,
    );
    expect(
      () => config.foodChoiceSelections.single.optionIds.add('fish'),
      throwsUnsupportedError,
    );
    expect(() => config.selectedFoods.add('fish'), throwsUnsupportedError);
    expect(
      () => CustomerEventList.decode(raw, ownerUid: 'customer_B'),
      throwsFormatException,
    );
  });
  test('reject malformed and partial configuration without downgrading', () {
    final mutations = <void Function(Map<String, dynamic>)>[
      (v) => v['event']['eventDate'] = '2030-02-30',
      (v) => v['event']['eventEndTime'] = '09:00',
      (v) => v['event']['guestCount'] = 0,
      (v) => v['expectedPackageRevision'] = null,
      (v) => v.remove('foodChoiceSelections'),
      (v) => v['foodChoiceSelections'][0]['optionIds'] = ['fish', 'fish'],
      (v) => v['foodChoiceSelections'][0]['groupId'] = 'bad/id',
      (v) => v['selectedFurniture'] = ['Chair', 1],
      (v) => v['selectedAddOns'][0]['source'] = 'unknown',
      (v) => v['estimatedTotal'] = -1,
      (v) => v['serviceTier'] = 'unknown',
      (v) => v['bookingToken'] = 'forbidden',
      (v) => v['agreementAcknowledgements'] = [],
      (v) => v['pricingContext']['displayedServicePrice'] = double.infinity,
    ];
    for (final mutate in mutations) {
      final value = configuration();
      mutate(value);
      expect(
        () => CustomerEventListConfiguration.fromJson(value),
        throwsFormatException,
      );
    }
    final value = entry().toJson()..['configuration'] = null;
    expect(() => CustomerEventListEntry.fromJson(value), throwsFormatException);
  });
  test('legacy customization and custom theme text round-trip', () {
    final value = configuration()
      ..['sharedContractVersion'] = null
      ..['expectedPackageRevision'] = null
      ..['foodChoiceSelections'] = []
      ..['selectedFoods'] = ['Chicken']
      ..['themeChoice'] = 'custom'
      ..['packageThemeId'] = null
      ..['customTheme'] = 'Rustic garden';
    expect(CustomerEventListConfiguration.fromJson(value).toJson(), value);
  });
  test('record byte and entry limits apply on encode and decode', () {
    final value = configuration()..['customTheme'] = '花' * 10000;
    final configured = entry(CustomerEventListConfiguration.fromJson(value));
    final record = list(configured).toJson();
    record['entries'] = List.generate(
      4,
      (i) => {...configured.toJson(), 'packageId': 'package_$i'},
    );
    final raw = jsonEncode(record);
    expect(
      () => CustomerEventList.decode(raw, ownerUid: 'customer_A'),
      throwsFormatException,
    );
    final oversized = CustomerEventList(
      ownerUid: 'customer_A',
      revision: 1,
      updatedAt: DateTime.utc(2030),
      entries: (record['entries'] as List)
          .map(
            (v) => CustomerEventListEntry.fromJson(v as Map<String, dynamic>),
          )
          .toList(),
    );
    expect(oversized.encode, throwsFormatException);
    expect(
      () => CustomerEventList(
        ownerUid: 'customer_A',
        revision: 1,
        updatedAt: DateTime.utc(2030),
        entries: List.generate(25, (_) => entry()),
      ),
      throwsFormatException,
    );
  });
}
