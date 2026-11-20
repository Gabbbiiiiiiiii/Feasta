import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/features/customer/customization_session.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/event_list_customization_controller.dart';
import 'customer_event_list_test.dart'
    show MemoryEventStorage, EventAuth, entry;
import 'event_list_catalog_test.dart' show saved;
import 'booking_preparation_test.dart' show preparationPackage;
import 'provider_discovery_test.dart' show provider;

void main() {
  late EventAuth auth;
  late MemoryEventStorage storage;
  late EventListController list;
  late EventListCustomizationController handoff;
  late Future<PackageModel?> Function() packageLookup;
  late Future<ProviderModel?> Function() providerLookup;
  late Future<void> Function() destination;
  int navigations = 0, packages = 0, providers = 0;
  bool origin = true;
  CustomizationSession? binding;
  setUp(() async {
    auth = EventAuth();
    storage = MemoryEventStorage();
    list = EventListController(
      store: EventListStore(storage: storage),
      authentication: auth,
    );
    await list.addPackage(saved());
    packageLookup = () async => preparationPackage();
    providerLookup = () async => provider();
    destination = () async {};
    navigations = packages = providers = 0;
    origin = true;
    binding = null;
    handoff = EventListCustomizationController(
      controller: list,
      lookupPackage: (p, k) {
        expect(p, 'caterer-1');
        expect(k, 'package-1');
        packages++;
        return packageLookup();
      },
      lookupProvider: (p) {
        expect(p, 'caterer-1');
        providers++;
        return providerLookup();
      },
    );
  });
  tearDown(() {
    handoff.dispose();
    list.dispose();
    auth.dispose();
  });
  Future<void> start() => handoff.customize(
    saved(),
    originIsCurrent: () => origin,
    navigate: (p, k, s) async {
      expect(p.businessName, 'Ana Catering');
      expect(k.name, 'Celebration');
      expect(k.price, 12000);
      expect(s.authorized, isTrue);
      binding = s;
      navigations++;
      await destination();
    },
  );
  test(
    'fresh full models, no saved estimate authorization, no list write',
    () async {
      final before = Map<String, String>.from(storage.values);
      await start();
      expect(navigations, 1);
      expect(packages, 1);
      expect(providers, 1);
      expect(storage.values, before);
      await start();
      expect(packages, 2);
      expect(navigations, 2);
    },
  );
  final failures = <String, String>{
    'null': 'currently unavailable',
    'inactive': 'currently unavailable',
    'provider hidden': 'currently unavailable',
    'provider null': "couldn't verify",
    'package id': "couldn't verify",
    'package provider': "couldn't verify",
    'provider id': "couldn't verify",
    'network': "couldn't verify",
    'permission': "couldn't verify",
    'malformed': "couldn't verify",
    'nan': 'latest package price',
    'infinity': 'latest package price',
    'negative': 'latest package price',
    'unknown': 'latest package price',
  };
  for (final item in failures.entries) {
    test('fresh rejection: ${item.key}', () async {
      switch (item.key) {
        case 'null':
          packageLookup = () async => null;
        case 'inactive':
          packageLookup = () async => preparationPackage({'isActive': false});
        case 'provider hidden':
          providerLookup = () async => provider(visible: false);
        case 'provider null':
          providerLookup = () async => null;
        case 'package id':
          packageLookup = () async =>
              PackageModel.fromMap('unexpected', {'providerId': 'caterer-1'});
        case 'package provider':
          packageLookup = () async =>
              preparationPackage({'providerId': 'unexpected'});
        case 'provider id':
          providerLookup = () async => provider(id: 'unexpected');
        case 'network':
          packageLookup = () async => throw StateError('offline');
        case 'permission':
          providerLookup = () async => throw FirebaseException(
            plugin: 'cloud_firestore',
            code: 'permission-denied',
          );
        case 'malformed':
          providerLookup = () async => throw const FormatException();
        case 'nan':
          packageLookup = () async => preparationPackage({'price': double.nan});
        case 'infinity':
          packageLookup = () async =>
              preparationPackage({'price': double.infinity});
        case 'negative':
          packageLookup = () async => preparationPackage({'price': -1});
        case 'unknown':
          packageLookup = () async => preparationPackage({'price': 'unknown'});
      }
      final before = Map<String, String>.from(storage.values);
      await start();
      expect(navigations, 0);
      expect(handoff.busy, isFalse);
      expect(handoff.message, contains(item.value));
      expect(storage.values, before);
    });
  }
  test(
    'double/different taps share one lock until destination returns',
    () async {
      await list.addPackage(entry());
      final gate = Completer<PackageModel?>();
      final returned = Completer<void>();
      packageLookup = () => gate.future;
      destination = () => returned.future;
      final first = start();
      await start();
      await handoff.customize(
        entry(),
        originIsCurrent: () => true,
        navigate: (_, _, _) async {
          fail('duplicate');
        },
      );
      expect(packages, 1);
      gate.complete(preparationPackage());
      await Future<void>.delayed(Duration.zero);
      expect(navigations, 1);
      expect(handoff.busy, isTrue);
      await start();
      expect(packages, 1);
      returned.complete();
      await first;
      expect(handoff.busy, isFalse);
    },
  );
  for (final phase in ['package', 'provider']) {
    for (final change in [
      'B',
      'ABA',
      'same UID',
      'signout',
      'suspend',
      'remove intent',
      'clear intent',
      'failed remove',
      'remove resave',
      'revision',
      'route',
      'dispose',
    ]) {
      test('$phase pending rejects $change and stale errors', () async {
        final packageGate = Completer<PackageModel?>();
        final providerGate = Completer<ProviderModel?>();
        if (phase == 'package') {
          packageLookup = () => packageGate.future;
        } else {
          providerLookup = () => providerGate.future;
        }
        final old = start();
        await Future<void>.delayed(Duration.zero);
        switch (change) {
          case 'B':
            auth.switchTo('customer_B');
          case 'ABA':
            auth.switchTo('customer_B');
            auth.switchTo('customer_A');
          case 'same UID':
            auth.switchTo('customer_A', newSession: true);
          case 'signout':
            auth.switchTo(null);
          case 'suspend':
            auth.switchTo(null, newSession: true);
          case 'remove intent':
            handoff.invalidate(identity: saved().identity);
          case 'clear intent':
            handoff.invalidate();
          case 'failed remove':
            handoff.invalidate(identity: saved().identity);
            storage.failWrite = true;
            expect(
              await list.removePackage(saved().identity),
              EventListResult.persistenceError,
            );
          case 'remove resave':
            handoff.invalidate(identity: saved().identity);
            await list.removePackage(saved().identity);
            await list.addPackage(saved());
          case 'revision':
            await list.addPackage(saved(price: 50));
          case 'route':
            origin = false;
          case 'dispose':
            handoff.dispose();
        }
        if (phase == 'package') {
          packageGate.completeError(StateError('stale'));
        } else {
          providerGate.completeError(StateError('stale'));
        }
        await old;
        expect(navigations, 0);
        expect(handoff.message, isNull);
        expect(handoff.busy, isFalse);
        if (change == 'dispose') {
          // Replace disposed test instance for the shared teardown.
          handoff = EventListCustomizationController(
            controller: list,
            lookupPackage: (_, _) async => null,
            lookupProvider: (_) async => null,
          );
        }
      });
    }
  }
  test('old completion cannot release or report over a newer owner', () async {
    final oldGate = Completer<PackageModel?>(),
        newGate = Completer<PackageModel?>();
    packageLookup = () => oldGate.future;
    final old = start();
    handoff.invalidate();
    packageLookup = () => newGate.future;
    final current = start();
    oldGate.completeError(StateError('old'));
    await old;
    expect(handoff.busy, isTrue);
    expect(handoff.message, isNull);
    newGate.complete(preparationPackage());
    await current;
    expect(navigations, 1);
  });
  test(
    'active route session closes permanently on same UID generation',
    () async {
      final returned = Completer<void>();
      destination = () => returned.future;
      final operation = start();
      await Future<void>.delayed(Duration.zero);
      final old = binding!;
      auth.switchTo('customer_A', newSession: true);
      expect(old.authorized, isFalse);
      auth.switchTo('customer_A', newSession: true);
      expect(old.authorized, isFalse);
      returned.complete();
      await operation;
    },
  );
  test('completed error is erased on account change', () async {
    packageLookup = () async => null;
    await start();
    expect(handoff.message, isNotNull);
    auth.switchTo('customer_B');
    expect(handoff.message, isNull);
  });
}
