import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'event_list_configuration_codec_test.dart' show configuration;
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_cloud_transport.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/shared/models/customer_event_list_cloud_contract.dart';
import 'customer_event_list_test.dart'
    show MemoryEventStorage, EventAuth, entry;

class CloudFake implements EventListCloudGateway {
  final events = StreamController<EventListCloudSnapshot>.broadcast(sync: true);
  final commands = <Map<String, dynamic>>[];
  Map<String, dynamic>? value;
  Object? failure;
  bool publish = true;
  Completer<void>? dispatched;
  final receipts = <String, Map<String, dynamic>>{};
  @override
  Stream<EventListCloudSnapshot> watch(String uid) => events.stream;
  void emit({bool cache = false, bool pending = false}) => events.add(
    EventListCloudSnapshot(
      document: value == null
          ? null
          : CloudCustomerEventList.fromJson(
              value,
              ownerUid: value!['ownerUid'],
            ),
      fromCache: cache,
      hasPendingWrites: pending,
    ),
  );
  @override
  Future<EventListCloudMutationResult> mutate(
    Map<String, dynamic> command,
  ) async {
    commands.add(jsonDecode(jsonEncode(command)) as Map<String, dynamic>);
    if (dispatched != null && !dispatched!.isCompleted) dispatched!.complete();
    final replay = receipts.containsKey(command['requestId']);
    if (!replay) {
      if (failure is FirebaseFunctionsException) throw failure!;
      if (command['action'] == 'import') {
        value ??= Map<String, dynamic>.from(command['local'] as Map);
      } else {
        if (command['expectedRevision'] != value!['revision']) {
          throw FirebaseFunctionsException(code: 'aborted', message: 'stale');
        }
        value = jsonDecode(jsonEncode(value)) as Map<String, dynamic>;
        final rows = value!['entries'] as List;
        switch (command['action']) {
          case 'add':
            rows.insert(0, command['entry']);
          case 'update':
            rows[rows.indexWhere(
                  (e) => e['identity'] == command['entry']['identity'],
                )] =
                command['entry'];
          case 'remove':
            rows.removeWhere((e) => e['identity'] == command['identity']);
          case 'clear':
            rows.clear();
            value!['schedule'] = null;
          case 'schedule':
            value!['schedule'] = command['schedule'];
        }
        value!['revision'] = (value!['revision'] as int) + 1;
      }
      receipts[command['requestId'] as String] = {
        'revision': value!['revision'],
      };
    }
    if (publish) emit();
    if (failure != null) throw failure!;
    return EventListCloudMutationResult(
      revision: receipts[command['requestId']]!['revision'],
      changed: true,
      replayed: replay,
      migrationReviewRequired: false,
      removedIdentities: const [],
      preservedIdentities: const [],
    );
  }

  Future<void> close() => events.close();
}

Map<String, dynamic> emptyCloud() => {
  'version': 1,
  'ownerUid': 'customer_A',
  'revision': 0,
  'currency': 'PHP',
  'entries': <dynamic>[],
  'schedule': null,
  'migration': {'version': 1, 'completed': true},
};

Future<void> tick() => Future<void>.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late MemoryEventStorage memory;
  late EventAuth auth;
  late CloudFake cloud;
  late EventListController controller;
  EventListController create() => EventListController(
    store: EventListStore(storage: memory),
    authentication: auth,
    cloudEnabled: true,
    cloudTransport: cloud,
  );
  setUp(() {
    memory = MemoryEventStorage();
    auth = EventAuth();
    cloud = CloudFake();
    controller = create();
  });
  tearDown(() async {
    controller.dispose();
    auth.dispose();
    await cloud.close();
  });

  test(
    'existing empty cloud wins over local selections without importing',
    () async {
      await controller.store.addPackage(
        'customer_A',
        entry(),
        authorize: () {},
      );
      cloud.value = emptyCloud();
      cloud.emit();
      expect(await controller.load(), EventListResult.loaded);
      expect(controller.list!.entries, isEmpty);
      expect(cloud.commands, isEmpty);
    },
  );

  test('cache missing cannot import; confirmed missing imports once', () async {
    await controller.store.addPackage('customer_A', entry(), authorize: () {});
    cloud.emit(cache: true);
    final load = controller.load();
    await tick();
    expect(cloud.commands, isEmpty);
    expect(controller.list, isNull);
    cloud.emit();
    expect(await load, EventListResult.loaded);
    expect(cloud.commands.single['action'], 'import');
    expect(cloud.commands.single['expectedRevision'], isNull);
    expect(controller.list!.entries.single.packageId, 'package_0');
    expect(await controller.load(), EventListResult.loaded);
    expect(cloud.commands.length, 1);
  });

  test(
    'native add update remove clear use canonical identities and revisions',
    () async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      expect(await controller.addPackage(entry()), EventListResult.saved);
      expect(
        cloud.commands.last['entry']['identity'],
        'catering_package:provider_123:package_0',
      );
      expect(await controller.addPackage(entry()), EventListResult.saved);
      expect(cloud.commands.last['action'], 'update');
      expect(cloud.commands.last['expectedRevision'], 1);
      expect(
        await controller.removePackage(entry().identity),
        EventListResult.saved,
      );
      expect(
        cloud.commands.last['identity'],
        'catering_package:provider_123:package_0',
      );
      await controller.addPackage(entry(1));
      expect(await controller.clear(), EventListResult.saved);
      expect(controller.list!.entries, isEmpty);
    },
  );

  test(
    'accepted callable waits for confirmed snapshot and rejects duplicate dispatch',
    () async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      cloud.publish = false;
      var completed = false;
      final save = controller.addPackage(entry()).then((v) {
        completed = true;
        return v;
      });
      await tick();
      await tick();
      expect(controller.saving, true, reason: '${controller.error}');
      expect(completed, false);
      expect(
        await controller.addPackage(entry(1)),
        EventListResult.persistenceError,
      );
      expect(cloud.commands.length, 1);
      cloud.emit(cache: true);
      await tick();
      expect(completed, false);
      cloud.emit(pending: true);
      await tick();
      expect(completed, false);
      cloud.emit();
      expect(await save, EventListResult.saved);
    },
  );

  test(
    'uncertain network result survives reconstruction with identical command',
    () async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      cloud.failure = TimeoutException('response lost');
      expect(
        await controller.addPackage(entry()),
        EventListResult.persistenceError,
      );
      final original = jsonEncode(cloud.commands.single);
      controller.dispose();
      controller = create();
      cloud.failure = null;
      cloud.emit();
      expect(await controller.load(), EventListResult.loaded);
      expect(jsonEncode(cloud.commands.last), original);
      expect(controller.list!.entries.length, 1);
      expect(cloud.value!['revision'], 1);
    },
  );

  test('stale configuration is rejected before dispatch', () async {
    cloud.value = emptyCloud();
    cloud.emit();
    await controller.load();
    expect(
      await controller.saveConfiguration(entry(), expectedRevision: 5),
      EventListResult.persistenceError,
    );
    expect(cloud.commands, isEmpty);
  });

  test(
    'server revision conflict clears rejected recovery and never overwrites',
    () async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      cloud.failure = FirebaseFunctionsException(
        code: 'aborted',
        message: 'stale',
      );
      expect(
        await controller.addPackage(entry()),
        EventListResult.persistenceError,
      );
      cloud.failure = null;
      cloud.emit();
      expect(await controller.load(), EventListResult.loaded);
      expect(cloud.commands.length, 1);
      expect(controller.list!.entries, isEmpty);
    },
  );

  test(
    'Web fixtures preserve unsupported entries during Mobile mutations',
    () async {
      final fixtures =
          jsonDecode(
                File(
                  '../../contracts/customer-event-list/fixtures.json',
                ).readAsStringSync(),
              )
              as Map;
      cloud.value = Map<String, dynamic>.from(fixtures['document'] as Map);
      cloud.emit();
      expect(await controller.load(), EventListResult.loaded);
      expect(controller.unsupportedCloudEntries.length, 2);
      final preserved = jsonEncode(controller.unsupportedCloudEntries);
      expect(await controller.addPackage(entry()), EventListResult.saved);
      expect(jsonEncode(controller.unsupportedCloudEntries), preserved);
      expect((cloud.value!['entries'] as List).length, 5);
      expect(
        await controller.removeCloudEntry(
          controller.unsupportedCloudEntries.last['identity'] as String,
        ),
        EventListResult.saved,
      );
      expect(controller.unsupportedCloudEntries.length, 1);
    },
  );

  test('account changes immediately mask cloud and pending results', () async {
    cloud.value = emptyCloud();
    cloud.emit();
    await controller.load();
    cloud.publish = false;
    final save = controller.addPackage(entry());
    await tick();
    await tick();
    auth.switchTo('customer_B', notify: false);
    expect(controller.list, isNull);
    expect(controller.cloudDocument, isNull);
    expect(controller.unsupportedCloudEntries, isEmpty);
    auth.emit();
    expect(await save, EventListResult.unauthorized);
    expect(controller.list, isNull);
  });

  test('cloud cleanup cannot perform unproven deletion', () async {
    cloud.value = emptyCloud();
    cloud.emit();
    await controller.addPackage(entry());
    final before = cloud.commands.length;
    expect(
      await controller.removeSubmitted([entry()], session: auth.session),
      EventListResult.persistenceError,
    );
    expect(cloud.commands.length, before);
    expect(controller.list!.entries.length, 1);
  });

  test(
    'configured Mobile edit preserves configuration and Web navigation',
    () async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      final configured = CustomerEventListEntry(
        providerId: 'provider_123',
        packageId: 'package_0',
        packageName: 'Configured',
        providerName: 'Provider',
        configuration: CustomerEventListConfiguration.fromJson(configuration()),
      );
      expect(
        await controller.saveConfiguration(configured, expectedRevision: 0),
        EventListResult.saved,
      );
      final rows = cloud.value!['entries'] as List;
      expect(rows.single['configuration'], configured.configuration!.toJson());
      rows.single['href'] = '/customer/packages/package_0';
      cloud.emit();
      expect(
        await controller.saveConfiguration(
          configured,
          expectedRevision: 1,
          editingIdentity: configured.identity,
        ),
        EventListResult.saved,
      );
      expect(
        (cloud.value!['entries'] as List).single['href'],
        '/customer/packages/package_0',
      );
      expect(
        controller.list!.entries.single.configuration!.toJson(),
        configured.configuration!.toJson(),
      );
    },
  );

  test(
    'schedule uses canonical validation and clear removes schedule',
    () async {
      final fixtures =
          jsonDecode(
                File(
                  '../../contracts/customer-event-list/fixtures.json',
                ).readAsStringSync(),
              )
              as Map;
      cloud.value = Map<String, dynamic>.from(fixtures['document'] as Map);
      cloud.emit();
      await controller.load();
      final schedule = Map<String, dynamic>.from(
        cloud.value!['schedule'] as Map,
      );
      expect(
        await controller.saveCloudSchedule(schedule),
        EventListResult.saved,
      );
      expect(cloud.commands.last['schedule'], schedule);
      final before = cloud.commands.length;
      expect(
        await controller.saveCloudSchedule({'invalid': true}),
        EventListResult.persistenceError,
      );
      expect(cloud.commands.length, before);
      expect(await controller.clear(), EventListResult.saved);
      expect(cloud.value!['schedule'], isNull);
    },
  );
  test(
    'Web configuration saves through revisioned recovery and confirmation',
    () async {
      final fixtures =
          jsonDecode(
                File(
                  '../../contracts/customer-event-list/fixtures.json',
                ).readAsStringSync(),
              )
              as Map;
      cloud.value = Map<String, dynamic>.from(fixtures['document'] as Map);
      final web = (cloud.value!['entries'] as List).first;
      web['configuration']['themeInspiration'] = {
        'notes': '',
        'referenceSetupId': null,
      };
      web['configuration']['selectedEventServices'] = <Object>[];
      cloud.value!['entries'] = [web];
      cloud.emit();
      await controller.load();
      final saved = controller.list!.entries.single;
      final config = saved.configuration!.toJson();
      config['event']['eventAddress'] = 'Updated Web address';
      final edited = CustomerEventListEntry(
        providerId: saved.providerId,
        packageId: saved.packageId,
        packageName: saved.packageName,
        providerName: saved.providerName,
        configuration: CustomerEventListConfiguration.fromJson(config),
      );
      cloud.publish = false;
      var complete = false;
      final projected = CloudCustomerEventList.fromLocal(
        CustomerEventList(
          ownerUid: 'customer_A',
          revision: 0,
          updatedAt: DateTime.utc(2030),
          entries: [edited],
        ),
      ).toJson();
      final merged = mergeCloudMobileEdit(
        Map<String, dynamic>.from(web),
        Map<String, dynamic>.from((projected['entries'] as List).single),
      );
      CloudCustomerEventList.fromJson({
        ...cloud.value!,
        'entries': [merged],
      }, ownerUid: 'customer_A');
      final result = controller
          .saveConfiguration(
            edited,
            expectedRevision: 0,
            editingIdentity: saved.identity,
          )
          .then((r) {
            complete = true;
            return r;
          });
      await tick();
      await tick();
      expect(controller.saving, true, reason: '${controller.error}');
      expect(complete, false);
      final command = cloud.commands.single;
      expect(command['action'], 'update');
      expect(command['expectedRevision'], 0);
      expect(command['entry']['href'], web['href']);
      expect(
        command['entry']['configuration'].containsKey('customTheme'),
        false,
      );
      expect(
        command['entry']['configuration'].containsKey('selectedAddOns'),
        false,
      );
      expect(
        command['entry']['configuration']['event']['eventAddress'],
        'Updated Web address',
      );
      expect(
        memory.values['event_list_cloud_pending_v1_customer_A'],
        contains(command['requestId']),
      );
      cloud.emit(pending: true);
      await tick();
      expect(complete, false);
      cloud.emit();
      expect(await result, EventListResult.saved);
      expect(memory.values['event_list_cloud_pending_v1_customer_A'], '');
      expect(
        controller.list!.entries.single.configuration!.event.eventAddress,
        'Updated Web address',
      );
      expect(
        await controller.saveConfiguration(
          edited,
          expectedRevision: 0,
          editingIdentity: saved.identity,
        ),
        EventListResult.persistenceError,
      );
      expect(cloud.commands.length, 1);
    },
  );

  test(
    'save after uncertainty recovers without executing a different intent',
    () async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      cloud.failure = TimeoutException('lost');
      expect(
        await controller.addPackage(entry()),
        EventListResult.persistenceError,
      );
      cloud.failure = null;
      expect(
        await controller.addPackage(entry(1)),
        EventListResult.persistenceError,
      );
      expect(cloud.commands.last, cloud.commands.first);
      expect(controller.list!.entries.single.packageId, 'package_0');
      expect(cloud.value!['revision'], 1);
    },
  );

  test(
    'signed out guest uses only local storage with cloud gate enabled',
    () async {
      controller.dispose();
      final guestAuth = _GuestAuth();
      controller = EventListController(
        store: EventListStore(storage: memory),
        authentication: guestAuth,
        signedOutGuest: () => true,
        cloudEnabled: true,
        cloudTransport: cloud,
      );
      await controller.store.guestAddPackage(entry(), authorize: () {});
      expect(await controller.load(), EventListResult.loaded);
      expect(controller.list!.ownerUid, EventListStore.guestOwnerUid);
      expect(await controller.clear(), EventListResult.saved);
      expect(cloud.commands, isEmpty);
      controller.dispose();
      guestAuth.dispose();
      controller = create();
    },
  );

  test('cloud production gate defaults off', () {
    final disabled = EventListController(
      store: controller.store,
      authentication: auth,
    );
    expect(disabled.cloudEnabled, false);
    disabled.dispose();
  });

  test(
    'listener failure restarts on load and waits for a new confirmed snapshot',
    () async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      cloud.events.addError(StateError('listener disconnected'));
      expect(controller.cloudError, isNotNull);
      final retry = controller.load();
      await tick();
      cloud.emit();
      expect(await retry, EventListResult.loaded);
      expect(controller.cloudError, isNull);
    },
  );

  test(
    'authorization failure cannot discard an earlier uncertain receipt',
    () async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      cloud.failure = TimeoutException('lost response');
      expect(
        await controller.addPackage(entry()),
        EventListResult.persistenceError,
      );
      final original = cloud.commands.single;
      cloud.failure = FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'expired',
      );
      expect(await controller.load(), EventListResult.persistenceError);
      cloud.failure = null;
      expect(await controller.load(), EventListResult.loaded);
      expect(cloud.commands, [original, original, original]);
      expect(cloud.value!['revision'], 1);
    },
  );

  test(
    'navigation guard invalidates a queued native save before dispatch',
    () async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      var current = true;
      memory.readGate = Completer<void>();
      final save = controller.addPackage(entry(), isCurrent: () => current);
      await tick();
      current = false;
      memory.readGate!.complete();
      expect(await save, EventListResult.unauthorized);
      expect(cloud.commands, isEmpty);
    },
  );
}

class _GuestAuth extends EventAuth {
  _GuestAuth() {
    uid = null;
  }
  @override
  bool get guestPlanningAllowed => true;
}
