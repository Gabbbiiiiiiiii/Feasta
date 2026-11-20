import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/features/customer/event_list/event_list_catalog.dart';
import 'package:feasta/features/customer/event_list/event_list_review_models.dart';
import 'booking_preparation_test.dart' show preparationPackage;

CustomerEventListEntry saved({double? price = 12000}) => CustomerEventListEntry(
  providerId: 'caterer-1',
  packageId: 'package-1',
  packageName: 'Saved package',
  providerName: 'Saved provider',
  estimatedPrice: price,
);

void main() {
  test(
    'adapter dispatches exact composite identity and verifies eligibility',
    () async {
      final catalog = EventListCatalog(
        lookup: (provider, package) async {
          expect(provider, 'caterer-1');
          expect(package, 'package-1');
          return preparationPackage();
        },
      );
      final result = await catalog.check(saved());
      expect(result.status, EventListCatalogStatus.eligible);
      expect(result.latestPrice, 12000);
      expect(result.priceChanged(saved()), isFalse);
    },
  );
  test('successful null means unavailable with unknown reason', () async {
    final result = await EventListCatalog(
      lookup: (_, _) async => null,
    ).check(saved());
    expect(result.status, EventListCatalogStatus.unavailable);
  });
  for (final code in [
    'unavailable',
    'permission-denied',
    'deadline-exceeded',
  ]) {
    test('$code is uncertainty without technical error disclosure', () async {
      final result = await EventListCatalog(
        lookup: (_, _) async =>
            throw FirebaseException(plugin: 'cloud_firestore', code: code),
      ).check(saved());
      expect(result.status, EventListCatalogStatus.couldNotVerify);
      expect(result.latestPrice, isNull);
      expect(result.status.message, isNot(contains(code)));
    });
  }
  for (final change in [
    {'providerId': 'other-provider'},
    {'isActive': false},
    {'isPublished': false},
    {'providerPubliclyVisible': false},
    {'isDeleted': true},
    {'status': 'draft'},
  ]) {
    test('rejects inconsistent response $change', () async {
      final result = await EventListCatalog(
        lookup: (_, _) async => preparationPackage(change),
      ).check(saved());
      expect(result.status, EventListCatalogStatus.couldNotVerify);
    });
  }
  test('incorrect package identity is rejected', () async {
    final result = await EventListCatalog(
      lookup: (_, _) async =>
          PackageModel.fromMap('wrong-id', {'providerId': 'caterer-1'}),
    ).check(saved());
    expect(result.status, EventListCatalogStatus.couldNotVerify);
  });
  for (final price in [
    double.nan,
    double.infinity,
    double.negativeInfinity,
    -1.0,
  ]) {
    test('invalid price $price preserves eligible price uncertainty', () async {
      final result = await EventListCatalog(
        lookup: (_, _) async => preparationPackage({'price': price}),
      ).check(saved());
      expect(result.status, EventListCatalogStatus.priceUnavailable);
      expect(result.latestPrice, isNull);
    });
  }
  for (final price in [0.0, 11000.0, 13000.0]) {
    test('numeric price change in either direction: $price', () async {
      final entry = saved();
      final result = await EventListCatalog(
        lookup: (_, _) async => preparationPackage({'price': price}),
      ).check(entry);
      expect(result.priceChanged(entry), isTrue);
      expect(result.priceChanged(saved(price: null)), isFalse);
      expect(entry.estimatedPrice, 12000);
    });
  }
}
