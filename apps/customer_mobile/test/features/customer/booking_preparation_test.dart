import 'package:feasta/core/helpers/booking_preparation.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter_test/flutter_test.dart';

PackageModel preparationPackage([Map<String, dynamic> changes = const {}]) =>
    PackageModel.fromMap('package-1', {
      'providerId': 'caterer-1',
      'name': 'Celebration',
      'eventType': 'Wedding',
      'description': 'Actual package description',
      'price': 12000,
      'guestCapacity': 50,
      'minimumGuests': 10,
      'maximumGuests': 100,
      'isActive': true,
      'isPublished': true,
      'providerPubliclyVisible': true,
      'isDeleted': false,
      'status': 'published',
      'isCustomizable': true,
      'foodInclusions': ['Rice', 'Fish'],
      'decorInclusions': ['Flowers'],
      'furnitureInclusions': ['Tables'],
      'serviceInclusions': ['Setup'],
      ...changes,
    });
String? validate(
  PackageModel package, {
  String providerId = 'caterer-1',
  DateTime? date,
  int start = 840,
  int end = 1080,
  int guests = 50,
  String city = 'Ormoc City',
  String address = 'Main Street, District 1',
  List<String> foods = const ['Rice'],
  List<String> decor = const ['Flowers'],
  List<String> furniture = const ['Tables'],
  String? tier,
  String? theme,
}) => validatePreparation(
  package: package,
  providerId: providerId,
  date: date ?? DateTime(2030, 1, 2),
  startMinutes: start,
  endMinutes: end,
  guests: guests,
  city: city,
  address: address,
  foods: foods,
  decorations: decor,
  furniture: furniture,
  serviceTier: tier,
  themeId: theme,
  now: DateTime(2030, 1, 1),
);
void main() {
  test('strict published eligibility and provider association', () {
    expect(
      eligiblePreparationPackage(preparationPackage(), 'caterer-1'),
      isTrue,
    );
    for (final change in [
      {'isPublished': false},
      {'isActive': false},
      {'providerPubliclyVisible': false},
      {'isDeleted': true},
      {'status': 'draft'},
    ]) {
      expect(
        eligiblePreparationPackage(preparationPackage(change), 'caterer-1'),
        isFalse,
      );
    }
    expect(
      validate(preparationPackage(), providerId: 'other'),
      contains('no longer available'),
    );
  });
  test(
    'real gallery field and unknown price/capacity are preserved honestly',
    () {
      final package = preparationPackage({
        'imageUrls': ['https://example.com/real.jpg'],
        'imageUrl': 'legacy',
        'price': null,
        'guestCapacity': null,
        'maximumGuests': null,
      });
      expect(package.imageUrl, 'https://example.com/real.jpg');
      expect(preparationEstimate(package, []), isNull);
      expect(preparationMaximumGuests(package), isNull);
      expect(
        preparationEstimate(preparationPackage({'price': 'not a price'}), []),
        isNull,
      );
    },
  );
  test('date/time, city, guest and stale options validation', () {
    final package = preparationPackage();
    expect(validate(package), isNull);
    expect(validate(package, date: DateTime(2029)), contains('future'));
    expect(validate(package, start: 900, end: 800), contains('later'));
    for (final count in [-2, 0, 9, 101]) {
      expect(validate(package, guests: count), contains('Guest count'));
    }
    expect(validate(package, city: 'Cebu City'), contains('Ormoc City'));
    expect(validate(package, address: ''), contains('complete event address'));
    expect(
      validate(package, foods: ['Unpublished choice']),
      contains('options changed'),
    );
    expect(
      validate(preparationPackage({'isCustomizable': false})),
      contains('fixed inclusions'),
    );
  });
  test(
    'real tier prices replace base; themes are supported only for appropriate tiers',
    () {
      final package = preparationPackage({
        'serviceOptions': {
          'drop_off': {
            'price': 10000,
            'includedServices': ['Delivery'],
          },
          'full_service': {
            'price': 15000,
            'includedServices': ['Staff'],
          },
        },
        'themeOptions': [
          {'id': 'garden', 'name': 'Garden'},
        ],
      });
      expect(validate(package), contains('service option'));
      expect(validate(package, tier: 'full_service', theme: 'garden'), isNull);
      expect(
        validate(package, tier: 'drop_off', theme: 'garden'),
        contains('theme'),
      );
      expect(
        validate(package, tier: 'full_service', theme: 'missing'),
        contains('theme'),
      );
      expect(
        preparationEstimate(package, [
          {'price': 300},
        ], serviceTier: 'full_service'),
        15300,
      );
      expect(preparationEstimate(package, [], serviceTier: 'unknown'), isNull);
    },
  );
  test(
    'unknown add-on price cannot silently become zero; no invented fees',
    () {
      expect(
        preparationEstimate(preparationPackage(), [
          {'price': 500},
        ]),
        12500,
      );
      for (final price in [null, -1, double.infinity, 'unknown']) {
        expect(
          preparationEstimate(preparationPackage(), [
            {'price': price},
          ]),
          isNull,
        );
      }
      expect(preparationEstimate(preparationPackage({'price': 0}), []), 0);
    },
  );
  test(
    'account/provider/package scoped memory clears incompatible choices',
    () {
      final memory = PreparationDraftMemory();
      expect(memory.open('customer-1', 'provider-1', 'package-1'), isNull);
      memory.save('customer-1', 'provider-1', 'package-1', {
        'notes': 'Keep me',
        'menu': ['Rice'],
      });
      expect(
        memory.open('customer-1', 'provider-1', 'package-1')!['notes'],
        'Keep me',
      );
      expect(memory.open('customer-1', 'provider-1', 'package-2'), isNull);
      memory.save('customer-1', 'provider-1', 'package-1', {
        'notes': 'stale route',
      });
      expect(memory.open('customer-1', 'provider-1', 'package-2'), isNull);
      expect(memory.open('customer-2', 'provider-1', 'package-2'), isNull);
    },
  );
}
