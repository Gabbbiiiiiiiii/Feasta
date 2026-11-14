import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'booking_attempt_test.dart' show MemoryStore, selection;
import 'dart:async';
import 'dart:convert';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class DraftStore implements EventDraftStore {
  final values = <String, String>{};
  Completer<void>? gate;
  bool fail = false;
  Completer<void>? deleteGate;
  final deleteEntered = Completer<void>();
  bool failDelete = false;
  int deleteCalls = 0;
  int writes = 0;
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    await gate?.future;
    if (fail) throw StateError('Storage unavailable');
    values[key] = value;
    writes++;
  }

  @override
  Future<void> delete(String key) async {
    deleteCalls++;
    if (!deleteEntered.isCompleted) deleteEntered.complete();
    await deleteGate?.future;
    if (failDelete) throw StateError('Deletion unavailable');
    values.remove(key);
  }
}

Map<String, dynamic> form() => {
  'step': 1,
  'date': DateTime(2030, 6, 12),
  'start': const TimeOfDay(hour: 14, minute: 25),
  'end': null,
  'type': 'Wedding',
  'guests': 0,
  'city': 'Ormoc City',
  'address': '',
  'eventAddress': null,
  'notes': 'No peanuts',
  'ownNotes': 'Own cake',
  'foods': ['Rice'],
  'decorations': <String>[],
  'furniture': ['Tables'],
  'addons': [
    {
      'addonId': 'a',
      'providerId': 'p',
      'source': 'catering_provider',
      'price': 999,
    },
  ],
  'own': true,
  'tier': 'full_service',
  'theme': 'garden',
  'themeChoice': 'custom',
  'customTheme': 'Ocean blue',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final source in ['catering_provider', 'feasta_addon_provider']) {
    test(
      'duplicate $source IDs are rejected and stored corruption retained',
      () async {
        final store = DraftStore();
        final p = EventDraftPersistence(store);
        final addon = {
          'addonId': 'same_id',
          'providerId': 'provider',
          'source': source,
        };
        final data = {
          ...form(),
          'addons': [
            addon,
            {...addon},
          ],
        };
        await expectLater(
          p.save('u', 'p', 'k', data, () => 'u'),
          throwsFormatException,
        );
        expect(store.values, isEmpty);
        final raw = jsonEncode({
          'version': 1,
          'scope': jsonEncode(['u', 'p', 'k']),
          'form': EventDraftPersistence.encode(data),
        });
        store.values[p.key('u', 'p', 'k')] = raw;
        await expectLater(p.read('u', 'p', 'k'), throwsFormatException);
        expect(store.values[p.key('u', 'p', 'k')], raw);
        expect(store.writes, 0);
      },
    );
  }
  test(
    'deletion waits behind a controlled pending save and cannot be recreated by it',
    () async {
      final store = DraftStore()..gate = Completer<void>();
      final p = EventDraftPersistence(store);
      final save = p.save('u', 'p', 'k', form(), () => 'u');
      final deletion = p.delete('u', 'p', 'k', () => 'u');
      await Future<void>.delayed(Duration.zero);
      expect(store.deleteCalls, 0);
      store.gate!.complete();
      await Future.wait([save, deletion]);
      expect(store.writes, 1);
      expect(store.deleteCalls, 1);
      expect(await p.read('u', 'p', 'k'), isNull);
    },
  );
  test('duplicate identity uses trimmed IDs across sources and providers', () {
    final data = {
      ...form(),
      'addons': [
        {
          'addonId': ' addon_1 ',
          'providerId': 'p1',
          'source': 'catering_provider',
        },
        {
          'addonId': 'addon_1',
          'providerId': 'p2',
          'source': 'feasta_addon_provider',
        },
      ],
    };
    expect(
      () => EventDraftPersistence.decode(EventDraftPersistence.encode(data)),
      throwsFormatException,
    );
  });
  test(
    'distinct add-ons from the same provider survive restart in order',
    () async {
      final store = DraftStore();
      final p = EventDraftPersistence(store);
      final addons = [
        {
          'addonId': 'addon_1',
          'providerId': 'same_provider',
          'source': 'catering_provider',
        },
        {
          'addonId': 'addon_2',
          'providerId': 'same_provider',
          'source': 'catering_provider',
        },
        {
          'addonId': 'addon_3',
          'providerId': 'market_provider',
          'source': 'feasta_addon_provider',
        },
      ];
      await p.save('u', 'p', 'k', {...form(), 'addons': addons}, () => 'u');
      expect(
        (await EventDraftPersistence(store).read('u', 'p', 'k'))!['addons'],
        addons,
      );
    },
  );
  test(
    'draft recovery and deletion preserve uncertain attempt and request ID',
    () async {
      final attempts = MemoryStore();
      final coordinator = BookingAttemptCoordinator(
        store: attempts,
        currentUid: () => 'customer_123',
      );
      final attempt = await coordinator.prepare(selection());
      final pending =
          jsonDecode(attempts.values['customer_123']!) as Map<String, dynamic>;
      pending['status'] = 'outcomeUncertain';
      attempts.values['customer_123'] = jsonEncode(pending);
      final original = attempts.values['customer_123'];
      final drafts = EventDraftPersistence(DraftStore());
      await drafts.save(
        'customer_123',
        'provider_123',
        'package_123',
        form(),
        () => 'customer_123',
      );
      expect(
        await EventDraftPersistence(
          drafts.store,
        ).read('customer_123', 'provider_123', 'package_123'),
        isNotNull,
      );
      await drafts.delete(
        'customer_123',
        'provider_123',
        'package_123',
        () => 'customer_123',
      );
      expect(attempts.values['customer_123'], original);
      await expectLater(
        coordinator.prepare(selection(address: 'Changed address')),
        throwsStateError,
      );
      expect(attempts.values['customer_123'], original);
      expect(jsonDecode(original!)['clientRequestId'], attempt.clientRequestId);
    },
  );
  test(
    'secure draft namespace is separate and errors never reset device records',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      const channel = MethodChannel(
        'plugins.it_nomads.com/flutter_secure_storage',
      );
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      final calls = <String>[];
      addTearDown(() {
        debugDefaultTargetPlatformOverride = null;
        messenger.setMockMethodCallHandler(channel, null);
      });
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call.method);
        final options = (call.arguments as Map)['options'] as Map;
        expect(options['storageNamespace'], 'feasta_event_drafts_v1');
        expect(options['resetOnError'], 'false');
        expect(options['storageCipherAlgorithm'], 'AES_GCM_NoPadding');
        throw PlatformException(code: 'key_unavailable');
      });
      final drafts = EventDraftPersistence(const SecureEventDraftStore());
      await expectLater(
        drafts.read('u', 'p', 'k'),
        throwsA(isA<PlatformException>()),
      );
      expect(calls, ['read']);
    },
  );

  test(
    'failed save retains prior draft and does not poison the write queue',
    () async {
      final store = DraftStore();
      final p = EventDraftPersistence(store);
      await p.save('u', 'p', 'k', form(), () => 'u');
      store.fail = true;
      await expectLater(
        p.save('u', 'p', 'k', {...form(), 'notes': 'failed'}, () => 'u'),
        throwsStateError,
      );
      expect((await p.read('u', 'p', 'k'))!['notes'], 'No peanuts');
      store.fail = false;
      await p.save('u', 'p', 'k', {...form(), 'notes': 'retry'}, () => 'u');
      expect((await p.read('u', 'p', 'k'))!['notes'], 'retry');
    },
  );
  test(
    'partial form survives a fresh persistence instance with dates, choices and notes',
    () async {
      final store = DraftStore();
      await EventDraftPersistence(store).save('u', 'p', 'k', form(), () => 'u');
      final saved = (await EventDraftPersistence(store).read('u', 'p', 'k'))!;
      expect(saved['date'], DateTime(2030, 6, 12));
      expect(saved['start'], const TimeOfDay(hour: 14, minute: 25));
      expect(saved['end'], isNull);
      for (final key in [
        'step',
        'type',
        'guests',
        'city',
        'address',
        'notes',
        'ownNotes',
        'foods',
        'decorations',
        'furniture',
        'own',
        'tier',
        'theme',
        'themeChoice',
        'customTheme',
      ]) {
        expect(saved[key], form()[key], reason: key);
      }
      expect((saved['addons'] as List).single, {
        'addonId': 'a',
        'providerId': 'p',
        'source': 'catering_provider',
      });
      expect(jsonEncode(store.values), isNot(contains('clientRequestId')));
      expect(jsonEncode(store.values), isNot(contains('consent')));
    },
  );
  test('complete map address round trips all supported fields', () async {
    final store = DraftStore();
    final persistence = EventDraftPersistence(store);
    final address = CustomerAddressModel.defaultOrmoc.copyWith(
      id: 'map',
      fullAddress: 'Venue',
      houseNumber: '12',
      notes: 'Gate',
      latitude: 11.02,
      longitude: 124.61,
    );
    await persistence.save('u', 'p', 'k', {
      ...form(),
      'address': 'Venue',
      'eventAddress': address,
    }, () => 'u');
    final saved = (await persistence.read('u', 'p', 'k'))!;
    expect(
      (saved['eventAddress'] as CustomerAddressModel).toMap(),
      address.toMap(),
    );
  });
  test('account provider and package scopes cannot collide', () async {
    final p = EventDraftPersistence(DraftStore());
    await p.save('u', 'p', 'k', form(), () => 'u');
    for (final scope in [
      ['v', 'p', 'k'],
      ['u', 'q', 'k'],
      ['u', 'p', 'z'],
      ['u/p', 'k', ''],
    ]) {
      expect(await p.read(scope[0], scope[1], scope[2]), isNull);
    }
  });
  test('corrupt and unsupported records remain untouched', () async {
    final store = DraftStore();
    final p = EventDraftPersistence(store);
    final key = p.key('u', 'p', 'k');
    for (final raw in [
      '{',
      '{"version":2}',
      jsonEncode({
        'version': 1,
        'scope': jsonEncode(['u', 'p', 'k']),
        'form': {'step': 1},
      }),
    ]) {
      store.values[key] = raw;
      await expectLater(p.read('u', 'p', 'k'), throwsA(anything));
      expect(store.values[key], raw);
    }
  });
  test('invalid coordinates, times and duplicate selections fail closed', () {
    for (final change in [
      {'start': 1440},
      {
        'foods': ['Rice', 'Rice'],
      },
      {
        'eventAddress': {'latitude': 200},
      },
    ]) {
      expect(
        () => EventDraftPersistence.decode({
          ...EventDraftPersistence.encode(form()),
          ...change,
        }),
        throwsFormatException,
      );
    }
  });
  test('writes serialize and snapshot before asynchronous work', () async {
    final store = DraftStore()..gate = Completer<void>();
    final p = EventDraftPersistence(store);
    final first = form();
    final a = p.save('u', 'p', 'k', first, () => 'u');
    first['notes'] = 'mutated';
    final b = p.save('u', 'p', 'k', {...form(), 'notes': 'newest'}, () => 'u');
    store.gate!.complete();
    await Future.wait([a, b]);
    expect((await p.read('u', 'p', 'k'))!['notes'], 'newest');
  });
  test(
    'account change drops queued writes without cross account writes',
    () async {
      final store = DraftStore()..gate = Completer<void>();
      final p = EventDraftPersistence(store);
      String? uid = 'u';
      final a = p.save('u', 'p', 'k', form(), () => uid);
      await Future<void>.delayed(Duration.zero);
      final b = p.save('u', 'p', 'k', {
        ...form(),
        'notes': 'queued',
      }, () => uid);
      uid = 'v';
      store.gate!.complete();
      await Future.wait([a, b]);
      expect((await p.read('u', 'p', 'k'))!['notes'], 'No peanuts');
      expect(await p.read('v', 'p', 'k'), isNull);
    },
  );
  test(
    'explicit deletion orders after pending writes and isolates other drafts',
    () async {
      final p = EventDraftPersistence(DraftStore());
      await p.save('u', 'p', 'other', form(), () => 'u');
      final save = p.save('u', 'p', 'k', form(), () => 'u');
      final delete = p.delete('u', 'p', 'k', () => 'u');
      await Future.wait([save, delete]);
      expect(await p.read('u', 'p', 'k'), isNull);
      expect(await p.read('u', 'p', 'other'), isNotNull);
    },
  );
}
