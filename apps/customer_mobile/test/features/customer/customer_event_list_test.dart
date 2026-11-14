import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';

class MemoryEventStorage implements EventListStorage {
  MemoryEventStorage([Map<String, String>? values]) : values = values ?? {};
  final Map<String, String> values;
  bool failRead = false, failWrite = false, mismatch = false;
  int writes = 0;
  bool failVerificationRead = false;
  Completer<void>? readGate, writeGate;
  Completer<void>? enteredRead, enteredWrite;
  @override
  Future<String?> read(String key) async {
    final snapshot = values[key];
    if (enteredRead != null && !enteredRead!.isCompleted) {
      enteredRead!.complete();
    }
    await readGate?.future;
    if (failRead || (failVerificationRead && writes > 1)) {
      throw StateError('read failed');
    }
    return snapshot;
  }

  @override
  Future<void> write(String key, String value) async {
    if (enteredWrite != null && !enteredWrite!.isCompleted) {
      enteredWrite!.complete();
    }
    await writeGate?.future;
    if (failWrite) throw StateError('write failed');
    writes++;
    if (!mismatch) values[key] = value;
  }
}

class EventAuth extends EventListAuthentication {
  String? uid = 'customer_A';
  int generation = 0;
  @override
  EventListAuthSession get session =>
      EventListAuthSession(customerUid: uid, generation: generation);
  void switchTo(String? value, {bool notify = true, bool newSession = false}) {
    if (uid != value || newSession) generation++;
    uid = value;
    if (notify) emit();
  }

  void emit() => notifyListeners();
}

CustomerEventListEntry entry([
  int index = 0,
  String provider = 'provider_123',
]) => CustomerEventListEntry(
  providerId: provider,
  packageId: 'package_$index',
  packageName: 'Package $index',
  providerName: 'Provider',
);
void allow() {}
Map<String, dynamic> record() => CustomerEventList(
  ownerUid: 'customer_A',
  revision: 1,
  updatedAt: DateTime.utc(2030),
  entries: [entry()],
).toJson();

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late MemoryEventStorage memory;
  late EventListStore store;
  late EventAuth auth;
  late EventListController controller;
  setUp(() {
    memory = MemoryEventStorage();
    store = EventListStore(storage: memory);
    auth = EventAuth();
    controller = EventListController(store: store, authentication: auth);
  });
  tearDown(() {
    controller.dispose();
    auth.dispose();
  });

  test(
    'empty list loads without writing; explicit clear persists empty envelope',
    () async {
      expect(await controller.load(), EventListResult.loaded);
      expect(controller.list!.entries, isEmpty);
      expect(memory.writes, 0);
      expect(await controller.clear(), EventListResult.saved);
      expect(memory.writes, 1);
      final saved = CustomerEventList.decode(
        memory.values.values.single,
        ownerUid: auth.uid!,
      );
      expect(saved.entries, isEmpty);
      expect(saved.revision, 1);
    },
  );
  test(
    'one and multiple packages persist newest first; replacement moves to front',
    () async {
      expect(await controller.addPackage(entry()), EventListResult.saved);
      expect(controller.list!.entries.single.packageId, 'package_0');
      await controller.addPackage(entry(1));
      await controller.addPackage(entry());
      expect(controller.list!.entries.map((e) => e.packageId), [
        'package_0',
        'package_1',
      ]);
      expect(controller.list!.revision, 3);
      await controller.addPackage(entry(0, 'provider_456'));
      expect(controller.list!.entries.length, 3);
      expect(
        entry().identity.key,
        isNot(entry(0, 'provider_456').identity.key),
      );
    },
  );
  test(
    '24-item capacity rejects 25th without eviction; replacement allowed',
    () async {
      for (var i = 0; i < 24; i++) {
        expect(await controller.addPackage(entry(i)), EventListResult.saved);
      }
      expect(await controller.addPackage(entry(24)), EventListResult.capacity);
      expect(controller.list!.entries.length, 24);
      expect(memory.writes, 24);
      expect(await controller.addPackage(entry()), EventListResult.saved);
      expect(controller.list!.entries.first.packageId, 'package_0');
    },
  );
  test(
    'remove and clear persist without mutating prior immutable snapshots',
    () async {
      await controller.addPackage(entry());
      final old = controller.list!;
      await controller.removePackage(entry().identity);
      expect(controller.list!.entries, isEmpty);
      expect(old.entries.length, 1);
      expect(() => old.entries.clear(), throwsUnsupportedError);
      await controller.addPackage(entry());
      await controller.clear();
      expect(controller.list!.entries, isEmpty);
    },
  );
  for (final failure in ['read', 'write', 'verification']) {
    test(
      '$failure failure does not publish an unsaved change; queue recovers',
      () async {
        await controller.addPackage(entry());
        final old = controller.list;
        memory.failRead = failure == 'read';
        memory.failWrite = failure == 'write';
        memory.mismatch = failure == 'verification';
        expect(
          await controller.addPackage(entry(1)),
          EventListResult.persistenceError,
        );
        expect(controller.list, same(old));
        expect(controller.error, isNotNull);
        memory.failRead = false;
        memory.failWrite = false;
        memory.mismatch = false;
        expect(await controller.addPackage(entry(2)), EventListResult.saved);
      },
    );
  }
  final invalidRecords = <String, void Function(Map<String, dynamic>)>{
    'unsupported version': (r) => r['version'] = 2,
    'noninteger version': (r) => r['version'] = 1.0,
    'malformed owner': (r) => r['ownerUid'] = 'bad owner/',
    'different owner': (r) => r['ownerUid'] = 'customer_B',
    'invalid provider': (r) => r['entries'][0]['providerId'] = '../bad',
    'invalid package': (r) => r['entries'][0]['packageId'] = '',
    'duplicate identity': (r) => r['entries'].add(r['entries'][0]),
    'negative price': (r) => r['entries'][0]['estimatedPrice'] = -1,
    'string price': (r) => r['entries'][0]['estimatedPrice'] = 'unknown',
    'HTTP image': (r) => r['entries'][0]['imageUrl'] = 'http://example.com/x',
    'script image': (r) => r['entries'][0]['imageUrl'] = 'javascript:alert(1)',
    'credentials image': (r) =>
        r['entries'][0]['imageUrl'] = 'https://user:pass@example.com/x',
    'hostless image': (r) => r['entries'][0]['imageUrl'] = 'https:/x',
    'oversized name': (r) => r['entries'][0]['packageName'] = 'x' * 201,
    'oversized image': (r) =>
        r['entries'][0]['imageUrl'] = 'https://example.com/${'x' * 2048}',
    'too many entries': (r) =>
        r['entries'] = List.generate(25, (i) => entry(i).toJson()),
    'custom menu unsupported': (r) => r['entries'][0]['type'] = 'custom_menu',
    'services unsupported': (r) =>
        r['entries'][0]['attachedServices'] = ['service'],
    'consent field': (r) => r['agreementAcknowledged'] = true,
    'payment field': (r) => r['entries'][0]['paymentSession'] = 'secret',
    'negative revision': (r) => r['revision'] = -1,
    'wrong currency': (r) => r['currency'] = 'USD',
    'invalid timestamp': (r) => r['updatedAt'] = 'bad',
  };
  for (final invalid in invalidRecords.entries) {
    test(
      '${invalid.key}: read/add/remove/clear preserve unreadable record',
      () async {
        final data = record();
        invalid.value(data);
        final raw = jsonEncode(data);
        memory.values[store.key(auth.uid!)] = raw;
        expect(await controller.load(), EventListResult.persistenceError);
        expect(
          await controller.addPackage(entry(2)),
          EventListResult.persistenceError,
        );
        expect(
          await controller.removePackage(entry().identity),
          EventListResult.persistenceError,
        );
        expect(await controller.clear(), EventListResult.persistenceError);
        expect(memory.values.values.single, raw);
        expect(memory.writes, 0);
      },
    );
  }
  for (final raw in ['{broken', '[]', 'x' * 100001]) {
    test('corrupt/oversized raw record (${raw.length}) preserved', () async {
      memory.values[store.key(auth.uid!)] = raw;
      expect(await controller.clear(), EventListResult.persistenceError);
      expect(memory.values.values.single, raw);
      expect(memory.writes, 0);
    });
  }
  test(
    'unknown price stays null; valid price/image round trip; invalid nonfinite amounts rejected',
    () {
      expect(
        CustomerEventListEntry.fromJson(entry().toJson()).estimatedPrice,
        isNull,
      );
      final data = entry().toJson()
        ..['estimatedPrice'] = 0
        ..['imageUrl'] = 'https://example.com/a.png';
      expect(CustomerEventListEntry.fromJson(data).estimatedPrice, 0);
      for (final price in [
        -1.0,
        double.nan,
        double.infinity,
        double.negativeInfinity,
      ]) {
        expect(
          () => CustomerEventListEntry(
            providerId: 'provider_123',
            packageId: 'package_123',
            packageName: 'P',
            providerName: 'V',
            estimatedPrice: price,
          ),
          throwsFormatException,
        );
        expect(
          () => CustomerEventListEntry.fromJson(
            entry().toJson()..['estimatedPrice'] = price,
          ),
          throwsFormatException,
        );
      }
    },
  );
  test('owner validation and structured identity spaces', () {
    for (final uid in ['', 'bad/uid', ' x', 'x' * 129]) {
      expect(() => store.key(uid), throwsFormatException);
    }
    expect(store.key('customer_A'), isNot(store.key('customer_B')));
    expect(
      EventListIdentity.customMenu('provider_123', 'package_0').key,
      isNot(entry().identity.key),
    );
    expect(
      EventListIdentity.service(
        'catering_provider',
        'provider_123',
        'package_0',
      ).key,
      isNot(entry().identity.key),
    );
  });
  test('fresh storage/store/controller recover list after restart', () async {
    await controller.addPackage(entry());
    final fresh = EventListController(
      store: EventListStore(storage: MemoryEventStorage(memory.values)),
      authentication: auth,
    );
    expect(await fresh.load(), EventListResult.loaded);
    expect(fresh.list!.entries.single.packageId, 'package_0');
    fresh.dispose();
  });
  test('A/B isolation and immediate clearing on switch and sign-out', () async {
    await controller.addPackage(entry());
    auth.switchTo('customer_B');
    expect(controller.list, isNull);
    await controller.load();
    expect(controller.list!.entries, isEmpty);
    await controller.addPackage(entry(1));
    auth.switchTo('customer_A');
    await controller.load();
    expect(controller.list!.entries.single.packageId, 'package_0');
    auth.switchTo(null);
    expect(controller.list, isNull);
    expect(await controller.addPackage(entry()), EventListResult.unauthorized);
    expect(await controller.load(), EventListResult.unauthorized);
  });
  for (final transition in ['ABA', 'signout', 'dispose']) {
    for (final stage in ['read', 'write']) {
      test(
        '$transition during delayed $stage rejects stale callbacks',
        () async {
          await controller.addPackage(entry());
          final gate = Completer<void>(), entered = Completer<void>();
          if (stage == 'read') {
            memory.readGate = gate;
            memory.enteredRead = entered;
          } else {
            memory.writeGate = gate;
            memory.enteredWrite = entered;
          }
          final operation = stage == 'read'
              ? controller.load()
              : controller.addPackage(entry(1));
          await entered.future;
          if (transition == 'ABA') {
            auth.switchTo('customer_B');
            auth.switchTo('customer_A');
          } else if (transition == 'signout') {
            auth.switchTo(null);
          } else {
            controller.dispose();
            controller = EventListController(
              store: store,
              authentication: auth,
            );
          }
          expect(controller.list, isNull);
          gate.complete();
          expect(await operation, EventListResult.unauthorized);
          expect(controller.list, isNull);
        },
      );
    }
  }
  test(
    'concurrent add/remove and reconstructed stores preserve ordered mutations',
    () async {
      final other = EventListController(
        store: EventListStore(storage: memory),
        authentication: auth,
      );
      final results = await Future.wait([
        controller.addPackage(entry()),
        other.addPackage(entry(1)),
        controller.removePackage(entry().identity),
        controller.addPackage(entry(2)),
      ]);
      expect(results, everyElement(EventListResult.saved));
      await controller.load();
      expect(controller.list!.entries.map((e) => e.packageId), [
        'package_2',
        'package_1',
      ]);
      expect(controller.list!.revision, 4);
      other.dispose();
    },
  );
  test(
    'feature has no booking/draft/consent/payment/submission dependencies',
    () {
      for (final path in [
        'lib/shared/models/customer_event_list.dart',
        'lib/features/customer/event_list/event_list_store.dart',
        'lib/features/customer/event_list/event_list_controller.dart',
      ]) {
        final source = File(path).readAsStringSync();
        for (final forbidden in [
          'booking_attempt_coordinator.dart',
          'event_draft_persistence.dart',
          'cloud_firestore',
          'cloud_functions',
          '.prepare(',
          'clientRequestId',
          'paymentSession',
          'agreementAcknowledged',
        ]) {
          expect(source, isNot(contains(forbidden)), reason: path);
        }
      }
    },
  );

  const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    test('$platform secure configuration and read-back failure', () async {
      debugDefaultTargetPlatformOverride = platform;
      addTearDown(() {
        debugDefaultTargetPlatformOverride = null;
        messenger.setMockMethodCallHandler(channel, null);
      });
      var reads = 0;
      messenger.setMockMethodCallHandler(channel, (call) async {
        final options = (call.arguments as Map)['options'] as Map;
        if (platform == TargetPlatform.android) {
          expect(options['storageNamespace'], SecureEventListStorage.namespace);
          expect(options['resetOnError'], 'false');
          expect(options['storageCipherAlgorithm'], 'AES_GCM_NoPadding');
        } else {
          expect(options['accountName'], SecureEventListStorage.namespace);
          expect(options['accessibility'], 'unlocked_this_device');
          expect(options['synchronizable'], 'false');
        }
        if (call.method == 'read') reads++;
        return null;
      });
      final secure = EventListStore();
      await expectLater(
        secure.addPackage('customer_A', entry(), authorize: allow),
        throwsStateError,
      );
      expect(reads, 2);
    });
  }
  test('unsupported platforms fail closed', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    await expectLater(
      EventListStore().read('customer_A', authorize: allow),
      throwsUnsupportedError,
    );
  });

  test(
    'read-back exception preserves verified state and recoverable disk write',
    () async {
      await controller.addPackage(entry());
      final prior = controller.list;
      memory.failVerificationRead = true;
      expect(
        await controller.addPackage(entry(1)),
        EventListResult.persistenceError,
      );
      expect(controller.list, same(prior));
      memory.failVerificationRead = false;
      expect(await controller.load(), EventListResult.loaded);
      expect(controller.list!.entries.length, 2);
    },
  );

  test(
    'session switch during mutation read blocks write and queued operations',
    () async {
      final gate = Completer<void>(), entered = Completer<void>();
      memory.readGate = gate;
      memory.enteredRead = entered;
      final first = controller.addPackage(entry());
      final queued = controller.clear();
      await entered.future;
      auth.switchTo('customer_B');
      auth.switchTo('customer_A');
      gate.complete();
      expect(await first, EventListResult.unauthorized);
      expect(await queued, EventListResult.unauthorized);
      expect(memory.writes, 0);
      expect(controller.list, isNull);
    },
  );
}
