import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/features/customer/event_list/event_list_catalog.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/event_list_review_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_review_models.dart';
import 'customer_event_list_test.dart'
    show MemoryEventStorage, EventAuth, entry;

Future<void> tick() => Future<void>.delayed(Duration.zero);

void main() {
  test(
    'pure grouping preserves first provider/name, package order and tuple identities',
    () {
      CustomerEventListEntry item(
        String provider,
        String package,
        String name,
      ) => CustomerEventListEntry(
        providerId: provider,
        packageId: package,
        providerName: name,
        packageName: package,
      );
      final entries = [
        item('provider_A', 'package_1', 'Same'),
        item('provider_B', 'package_1', 'Same'),
        item('provider_A', 'package_2', 'Conflicting'),
      ];
      final groups = groupEventList(
        CustomerEventList(
          ownerUid: 'customer_A',
          revision: 1,
          updatedAt: DateTime.utc(2030),
          entries: entries,
        ),
      );
      expect(groups.map((g) => g.providerId), ['provider_A', 'provider_B']);
      expect(groups.map((g) => g.providerName), ['Same', 'Same']);
      expect(groups.first.entries.map((e) => e.packageId), [
        'package_1',
        'package_2',
      ]);
      expect(
        groups.first.entries.first.identity.key,
        isNot(groups.last.entries.first.identity.key),
      );
    },
  );

  late MemoryEventStorage memory;
  late EventAuth auth;
  late EventListController list;
  late EventListReviewController review;
  late List<Completer<PackageModel?>> pending;
  int calls = 0, active = 0, maximum = 0;
  setUp(() {
    memory = MemoryEventStorage();
    auth = EventAuth();
    pending = [];
    calls = 0;
    active = 0;
    maximum = 0;
    list = EventListController(
      store: EventListStore(storage: memory),
      authentication: auth,
    );
    review = EventListReviewController(
      controller: list,
      catalog: EventListCatalog(
        lookup: (_, _) async {
          calls++;
          active++;
          if (active > maximum) maximum = active;
          final gate = Completer<PackageModel?>();
          pending.add(gate);
          try {
            return await gate.future;
          } finally {
            active--;
          }
        },
      ),
    );
  });
  tearDown(() {
    review.dispose();
    list.dispose();
    auth.dispose();
  });
  Future<void> finish() async {
    while (pending.any((p) => !p.isCompleted)) {
      for (final p in pending.toList()) {
        if (!p.isCompleted) p.complete(null);
      }
      await tick();
    }
  }

  test(
    '24 entries use four shared workers, no storage writes or revisions, no retries',
    () async {
      for (var i = 0; i < 24; i++) {
        await list.addPackage(entry(i));
      }
      // Mutations supersede work; drain those requests before measuring a pass.
      await finish();
      final writes = memory.writes, revision = list.list!.revision;
      final before = calls;
      final pass = review.refresh();
      expect(active, 4);
      await finish();
      await pass;
      expect(calls - before, 24);
      expect(maximum, 4);
      expect(memory.writes, writes);
      expect(list.list!.revision, revision);
      await tick();
      expect(calls - before, 24);
    },
  );
  test(
    'overlapping refreshes discard queued work while retaining four active slots',
    () async {
      for (var i = 0; i < 8; i++) {
        await list.addPackage(entry(i));
      }
      final one = review.refresh();
      final two = review.refresh();
      final three = review.refresh();
      expect(maximum, lessThanOrEqualTo(4));
      await finish();
      await Future.wait([one, two, three]);
      expect(maximum, 4);
      for (final e in list.list!.entries) {
        expect(review.resultFor(e).status, EventListCatalogStatus.unavailable);
      }
    },
  );
  for (final transition in [
    'B',
    'ABA',
    'same UID',
    'sign out',
    'silent live change',
    'lifecycle',
  ]) {
    test('$transition masks old successes, errors and progress', () async {
      await list.addPackage(entry());
      await tick();
      final old = pending.single;
      if (transition == 'lifecycle') {
        review.suspend();
      } else if (transition == 'same UID') {
        auth.switchTo('customer_A', newSession: true);
      } else if (transition == 'silent live change') {
        auth.switchTo('customer_B', notify: false);
      } else {
        auth.switchTo(transition == 'sign out' ? null : 'customer_B');
        if (transition == 'ABA') auth.switchTo('customer_A');
      }
      expect(
        review.resultFor(entry()).status,
        EventListCatalogStatus.notChecked,
      );
      old.completeError(StateError('old private failure'));
      await tick();
      expect(
        review.resultFor(entry()).status,
        EventListCatalogStatus.notChecked,
      );
      if (transition == 'lifecycle') {
        review.resume();
        await tick();
        expect(calls, 2);
      }
      await finish();
    });
  }
  for (final mutation in ['remove', 'clear', 'resave']) {
    test(
      '$mutation rejects results from old revision without blocking persistence',
      () async {
        await list.addPackage(entry());
        await tick();
        final old = pending.single;
        if (mutation == 'clear') {
          await list.clear();
        } else {
          await list.removePackage(entry().identity);
        }
        if (mutation == 'resave') {
          await list.addPackage(entry());
        }
        old.complete(null);
        await tick();
        expect(
          review.resultFor(entry()).status,
          mutation == 'resave'
              ? EventListCatalogStatus.checking
              : EventListCatalogStatus.notChecked,
        );
        expect(memory.writes, mutation == 'resave' ? 3 : 2);
        await finish();
      },
    );
  }
  test(
    'failed refresh removes prior success and never automatically retries',
    () async {
      await list.addPackage(entry());
      await tick();
      pending.single.complete(null);
      await tick();
      expect(
        review.resultFor(entry()).status,
        EventListCatalogStatus.unavailable,
      );
      final pass = review.refresh();
      expect(review.resultFor(entry()).status, EventListCatalogStatus.checking);
      pending.last.completeError(StateError('network'));
      await pass;
      expect(
        review.resultFor(entry()).status,
        EventListCatalogStatus.couldNotVerify,
      );
      await tick();
      expect(calls, 2);
      final retry = review.refresh(only: entry().identity);
      await finish();
      await retry;
      expect(calls, 3);
    },
  );
  test('disposal rejects pending completion and queued dispatch', () async {
    await list.addPackage(entry());
    await tick();
    var notifications = 0;
    review.addListener(() => notifications++);
    review.dispose();
    pending.single.completeError(StateError('late'));
    await tick();
    expect(notifications, 0);
    expect(calls, 1);
    expect(review.resultFor(entry()).status, EventListCatalogStatus.notChecked);
    // Replace solely to keep shared teardown ownership simple.
    review = EventListReviewController(
      controller: list,
      catalog: EventListCatalog(lookup: (_, _) async => null),
    );
  });

  test('newer refresh failure rejects older successful completion', () async {
    await list.addPackage(entry());
    await tick();
    final old = pending.single;
    final latest = review.refresh();
    pending.last.completeError(StateError('latest failed'));
    await latest;
    expect(
      review.resultFor(entry()).status,
      EventListCatalogStatus.couldNotVerify,
    );
    old.complete(
      PackageModel.fromMap('package_0', {
        'providerId': 'provider_123',
        'price': 15000,
        'isActive': true,
        'isPublished': true,
        'providerPubliclyVisible': true,
        'isDeleted': false,
        'status': 'published',
      }),
    );
    await tick();
    expect(
      review.resultFor(entry()).status,
      EventListCatalogStatus.couldNotVerify,
    );
    expect(review.resultFor(entry()).latestPrice, isNull);
  });
  test(
    'A to B to A reload rejects old success while accepting current work',
    () async {
      await list.addPackage(entry());
      await tick();
      final old = pending.single;
      auth.switchTo('customer_B');
      await list.addPackage(entry());
      pending.last.complete(null);
      await tick();
      expect(
        review.resultFor(entry()).status,
        EventListCatalogStatus.unavailable,
      );
      auth.switchTo('customer_A');
      await list.load();
      expect(review.resultFor(entry()).status, EventListCatalogStatus.checking);
      old.complete(null);
      await tick();
      expect(review.resultFor(entry()).status, EventListCatalogStatus.checking);
      pending.last.completeError(StateError('current A failed'));
      await tick();
      expect(
        review.resultFor(entry()).status,
        EventListCatalogStatus.couldNotVerify,
      );
    },
  );
  test('targeted retry preserves other completed results', () async {
    await list.addPackage(entry());
    await list.addPackage(entry(1));
    await finish();
    final before = calls;
    final retry = review.refresh(only: entry().identity);
    expect(
      review.resultFor(entry(1)).status,
      EventListCatalogStatus.unavailable,
    );
    await finish();
    await retry;
    expect(calls, before + 1);
    expect(
      review.resultFor(entry(1)).status,
      EventListCatalogStatus.unavailable,
    );
  });
  test(
    'eligible price is cleared by failed refresh without changing saved estimate',
    () async {
      final saved = CustomerEventListEntry(
        providerId: 'provider_123',
        packageId: 'package_0',
        providerName: 'Provider',
        packageName: 'Package 0',
        estimatedPrice: 12000,
      );
      await list.addPackage(saved);
      await tick();
      pending.single.complete(
        PackageModel.fromMap('package_0', {
          'providerId': 'provider_123',
          'price': 13000,
          'isActive': true,
          'isPublished': true,
          'providerPubliclyVisible': true,
          'isDeleted': false,
          'status': 'published',
        }),
      );
      await tick();
      expect(review.resultFor(saved).priceChanged(saved), isTrue);
      final raw = memory.values.values.single;
      final pass = review.refresh();
      expect(review.resultFor(saved).latestPrice, isNull);
      pending.last.completeError(StateError('failed refresh'));
      await pass;
      expect(
        review.resultFor(saved).status,
        EventListCatalogStatus.couldNotVerify,
      );
      expect(review.resultFor(saved).latestPrice, isNull);
      expect(list.list!.entries.single.estimatedPrice, 12000);
      expect(memory.values.values.single, raw);
      expect(memory.writes, 1);
    },
  );
  test(
    'same UID replacement reload cannot accept old success or queued progress',
    () async {
      for (var i = 0; i < 6; i++) {
        await list.addPackage(entry(i));
      }
      final before = calls;
      auth.switchTo('customer_A', newSession: true);
      for (final e in [entry(), entry(5)]) {
        expect(review.resultFor(e).status, EventListCatalogStatus.notChecked);
      }
      await finish();
      expect(calls, before);
      await list.load();
      expect(active, 4);
      await finish();
      expect(calls - before, 6);
    },
  );
}
