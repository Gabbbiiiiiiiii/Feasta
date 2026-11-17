import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_count_badge.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'event_list_cloud_sync_test.dart' show CloudFake, emptyCloud;
import 'customer_event_list_test.dart'
    show EventAuth, MemoryEventStorage, entry;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late EventAuth auth;
  late CloudFake cloud;
  late EventListController controller;
  setUp(() {
    auth = EventAuth();
    cloud = CloudFake();
    controller = EventListController(
      store: EventListStore(storage: MemoryEventStorage()),
      authentication: auth,
      cloudEnabled: true,
      cloudTransport: cloud,
    );
  });
  tearDown(() async {
    controller.dispose();
    auth.dispose();
    await cloud.close();
  });
  Future<void> show(WidgetTester tester) => tester.pumpWidget(
    EventListScope(
      controller: controller,
      child: const MaterialApp(
        home: Scaffold(body: EventListCountBadge(child: Text('Plan'))),
      ),
    ),
  );
  Badge badge(WidgetTester tester) => tester.widget<Badge>(
    find.byKey(const ValueKey('event-list-count-badge')),
  );
  Map<String, dynamic> unsupported() {
    final fixtures =
        jsonDecode(
              File(
                '../../contracts/customer-event-list/fixtures.json',
              ).readAsStringSync(),
            )
            as Map;
    final value = Map<String, dynamic>.from(fixtures['document'] as Map);
    value['entries'] = (value['entries'] as List)
        .where((e) => e['kind'] == 'custom_menu')
        .toList();
    return value;
  }

  testWidgets(
    'Plan badge counts read-only cloud rows and reacts to confirmed updates',
    (tester) async {
      cloud.value = emptyCloud();
      cloud.emit();
      await controller.load();
      await show(tester);
      await tester.pumpAndSettle();
      expect(badge(tester).isLabelVisible, false);
      cloud.value = unsupported();
      cloud.emit(cache: true);
      await tester.pump();
      expect(badge(tester).isLabelVisible, false);
      cloud.emit(pending: true);
      await tester.pump();
      expect(badge(tester).isLabelVisible, false);
      cloud.emit();
      await tester.pump();
      expect(controller.list!.entries, isEmpty);
      expect(controller.selectionCount, 1);
      expect(badge(tester).isLabelVisible, true);
      expect(find.text('1'), findsOneWidget);
      cloud.value = emptyCloud()..['revision'] = 10;
      cloud.emit();
      await tester.pump();
      expect(badge(tester).isLabelVisible, false);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'refresh restores canonical count and account changes hide previous badges',
    (tester) async {
      cloud.value = unsupported();
      cloud.emit();
      await show(tester);
      await tester.pumpAndSettle();
      expect(find.text('1'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      controller = EventListController(
        store: controller.store,
        authentication: auth,
        cloudEnabled: true,
        cloudTransport: cloud,
      );
      cloud.emit();
      await show(tester);
      await tester.pumpAndSettle();
      expect(find.text('1'), findsOneWidget);
      auth.switchTo('customer_B');
      await tester.pump();
      expect(controller.selectionCount, 0);
      expect(badge(tester).isLabelVisible, false);
      auth.switchTo(null);
      await tester.pump();
      expect(controller.selectionCount, 0);
      expect(badge(tester).isLabelVisible, false);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'local mode counts device entries while guest mode keeps the badge hidden',
    (tester) async {
      controller.dispose();
      controller = EventListController(
        store: EventListStore(storage: MemoryEventStorage()),
        authentication: auth,
      );
      await controller.addPackage(entry());
      await show(tester);
      await tester.pumpAndSettle();
      expect(find.text('1'), findsOneWidget);
      expect(cloud.commands, isEmpty);
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      auth.dispose();
      auth = _GuestAuth();
      controller = EventListController(
        store: EventListStore(storage: MemoryEventStorage()),
        authentication: auth,
        cloudEnabled: true,
        cloudTransport: cloud,
        signedOutGuest: () => true,
      );
      await controller.store.guestAddPackage(entry(), authorize: () {});
      await controller.load();
      await show(tester);
      await tester.pumpAndSettle();
      expect(controller.list!.entries.length, 1);
      expect(badge(tester).isLabelVisible, false);
      expect(cloud.commands, isEmpty);
      await tester.pumpWidget(const SizedBox.shrink());
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
