import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'customer_event_list_test.dart' show EventAuth, MemoryEventStorage;
import 'event_list_submission_test.dart' show submissionEntry;

void main() {
  late EventAuth auth;
  late MemoryEventStorage storage;
  late EventListController list;
  setUp(() {
    auth = EventAuth();
    storage = MemoryEventStorage();
    list = EventListController(
      authentication: auth,
      store: EventListStore(storage: storage),
    );
  });
  tearDown(() {
    list.dispose();
    auth.dispose();
  });

  test(
    'confirmed submitted entries disappear, notify listeners and stay removed after reload',
    () async {
      final submitted = [submissionEntry(1), submissionEntry(2)];
      for (final entry in submitted) {
        await list.addPackage(entry);
      }
      var updates = 0;
      list.addListener(() => updates++);
      expect(
        await list.removeSubmitted(submitted, session: auth.session),
        EventListResult.saved,
      );
      expect(list.list!.entries, isEmpty);
      expect(updates, 1);
      await list.load();
      expect(list.list!.entries, isEmpty);
    },
  );
  test(
    'single-package cleanup preserves unrelated entries and newer configuration edits',
    () async {
      final submitted = submissionEntry(1);
      final other = submissionEntry(2);
      await list.addPackage(submitted);
      await list.addPackage(other);
      await list.removeSubmitted([submitted], session: auth.session);
      expect(list.list!.entries.single.identity.key, other.identity.key);
      final changed = submissionEntry(1, note: 'New event instructions');
      await list.addPackage(changed);
      await list.removeSubmitted([submitted], session: auth.session);
      expect(
        list.list!.entries.map((e) => e.identity.key),
        contains(changed.identity.key),
      );
      expect(
        list.list!.entries.first.configuration!.event.specialRequest,
        'New event instructions',
      );
    },
  );
  test(
    'mixed catering and marketplace service cleanup consumes both submitted kinds',
    () async {
      final catering = submissionEntry(1);
      final service = CustomerEventListEntry.marketplaceService(
        providerId: 'provider_789',
        serviceId: 'service_789',
        expectedRevision: 4,
        serviceName: 'Photography',
        providerName: 'Photographer',
        configuration: CustomerEventListConfiguration.marketplace(
          event: catering.configuration!.event.toJson(),
        ),
      );
      await list.addPackage(catering);
      await list.addPackage(service);
      await list.removeSubmitted([catering, service], session: auth.session);
      expect(list.list!.entries, isEmpty);
    },
  );
  test(
    'old account and same-UID old sessions cannot consume a current list',
    () async {
      final submitted = submissionEntry(1);
      await list.addPackage(submitted);
      final original = auth.session;
      auth.switchTo('customer_B');
      await list.addPackage(submitted);
      expect(
        await list.removeSubmitted([submitted], session: original),
        EventListResult.unauthorized,
      );
      expect(list.list!.entries, hasLength(1));
      final previous = auth.session;
      auth.switchTo('customer_B', newSession: true);
      await list.load();
      expect(
        await list.removeSubmitted([submitted], session: previous),
        EventListResult.unauthorized,
      );
      expect(list.list!.entries, hasLength(1));
    },
  );
  test(
    'failed cleanup persistence retains the list and supports a cleanup retry',
    () async {
      final submitted = submissionEntry(1);
      await list.addPackage(submitted);
      storage.failWrite = true;
      expect(
        await list.removeSubmitted([submitted], session: auth.session),
        EventListResult.persistenceError,
      );
      expect(list.list!.entries, hasLength(1));
      storage.failWrite = false;
      expect(
        await list.removeSubmitted([submitted], session: auth.session),
        EventListResult.saved,
      );
      expect(list.list!.entries, isEmpty);
    },
  );
}
