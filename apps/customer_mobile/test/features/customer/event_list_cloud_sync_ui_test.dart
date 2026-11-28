import 'dart:convert';
import 'dart:async';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/customer_event_list_screen.dart';
import 'package:feasta/features/customer/event_list/event_list_catalog.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'customer_event_list_test.dart' show MemoryEventStorage, EventAuth;
import 'provider_discovery_test.dart' show GuestAuth;
import 'event_list_cloud_sync_test.dart' show CloudFake;
import 'event_list_restore_edit_test.dart' show saved, currentPackage;
import 'event_list_customization_ui_test.dart' show HandoffRepository;
import 'booking_preparation_flow_test.dart' show PreparationAuth;
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/shared/models/customer_event_list_cloud_contract.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = GuestAuth();
  });

  testWidgets(
    'compatible Web package opens original edit and single-package review',
    (tester) async {
      FirebaseAuthPlatform.instance = PreparationAuth();
      PreparationAuth.owner = 'customer_A';
      GuestAuth.signedIn = true;
      tester.view.physicalSize = const Size(900, 2200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final review in [false, true]) {
        final auth = EventAuth();
        final doc = CloudCustomerEventList.fromLocal(
          CustomerEventList(
            ownerUid: 'customer_A',
            revision: 0,
            updatedAt: DateTime.utc(2030),
            entries: [saved(v2: true)],
          ),
        ).toJson();
        final row = (doc['entries'] as List).single;
        final config = row['configuration'] as Map;
        config['themeInspiration'] = {
          'notes': config.remove('customTheme'),
          'referenceSetupId': null,
        };
        config['selectedEventServices'] = <Object>[];
        config.remove('themeChoice');
        config.remove('selectedAddOns');
        row['href'] = '/customer/packages/package-1';
        final cloud = CloudFake()..value = doc;
        final controller = EventListController(
          store: EventListStore(storage: MemoryEventStorage()),
          authentication: auth,
          cloudEnabled: true,
          cloudTransport: cloud,
        );
        cloud.emit();
        var checks = 0;
        await tester.pumpWidget(
          EventListScope(
            controller: controller,
            child: MaterialApp(
              key: UniqueKey(),
              home: CustomerEventListScreen(
                repository: HandoffRepository()
                  ..current = currentPackage(v2: true),
                catalog: EventListCatalog(lookup: (_, _) async => null),
                bookingEligibilityCheck: (_) async {
                  checks++;
                  return true;
                },
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        if (review) {
          final fixtures =
              jsonDecode(
                    File(
                      '../../contracts/customer-event-list/fixtures.json',
                    ).readAsStringSync(),
                  )
                  as Map;
          final unsupported = (fixtures['document']['entries'] as List).last;
          (cloud.value!['entries'] as List).add(unsupported);
          cloud.value!['revision'] = 1;
          cloud.emit();
          await tester.pumpAndSettle();
          expect(
            tester
                .widget<FilledButton>(
                  find.widgetWithText(
                    FilledButton,
                    'Review and submit booking request',
                  ),
                )
                .onPressed,
            isNull,
          );
          expect(controller.selectionCount, 2);
          (cloud.value!['entries'] as List).removeLast();
          cloud.value!['revision'] = 2;
          cloud.emit();
          await tester.pumpAndSettle();
        }
        final button = find.widgetWithText(
          FilledButton,
          review ? 'Review and submit booking request' : 'Edit details',
        );
        expect(tester.widget<FilledButton>(button).onPressed, isNotNull);
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pumpAndSettle();
        expect(checks, 1);
        final screen = tester.widget<EventCustomizationScreen>(
          find.byType(EventCustomizationScreen),
        );
        expect(screen.initialConfiguration!.customTheme, 'Rustic lights');
        expect(screen.openReviewOnLoad, review);
        expect(screen.session!.authorized, true);
        expect(cloud.commands, isEmpty);
        await tester.pumpWidget(const SizedBox.shrink());
        controller.dispose();
        auth.dispose();
        await cloud.close();
      }
      FirebaseAuthPlatform.instance = GuestAuth();
    },
  );
  testWidgets(
    'unsupported Web selection stays visible; remove saves only after server confirmation',
    (tester) async {
      final fixture =
          jsonDecode(
                File(
                  '../../contracts/customer-event-list/fixtures.json',
                ).readAsStringSync(),
              )
              as Map;
      final doc = Map<String, dynamic>.from(fixture['document'] as Map);
      doc['entries'] = (doc['entries'] as List)
          .where((e) => e['kind'] == 'custom_menu')
          .toList();
      final name = (doc['entries'] as List).single['name'] as String;
      final cloud = CloudFake()..value = doc;
      final auth = EventAuth();
      final controller = EventListController(
        store: EventListStore(storage: MemoryEventStorage()),
        authentication: auth,
        cloudEnabled: true,
        cloudTransport: cloud,
      );
      cloud.emit();
      await tester.pumpWidget(
        EventListScope(
          controller: controller,
          child: MaterialApp(
            home: CustomerEventListScreen(
              catalog: EventListCatalog(lookup: (_, _) async => null),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(name), findsOneWidget);
      expect(find.textContaining('Its full data is preserved'), findsOneWidget);
      expect(find.text('Your Event List is Empty'), findsNothing);
      expect(find.byTooltip('Clear list'), findsOneWidget);
      expect(find.text('1 provider · 1 selection'), findsOneWidget);
      expect(find.text('Estimated price'), findsOneWidget);
      expect(find.byType(ExpansionTile), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Edit details'),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(find.text('Package details'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Serving option:'), findsOneWidget);
      expect(cloud.commands, isEmpty);
      cloud.publish = false;
      cloud.dispatched = Completer<void>();
      await tester.ensureVisible(find.widgetWithText(TextButton, 'Remove'));
      await tester.tap(find.widgetWithText(TextButton, 'Remove'));
      await tester.pump();
      await tester.runAsync(() => cloud.dispatched!.future);
      expect(controller.saving, true);
      expect(controller.selectionCount, 1);
      await tester.drag(find.byType(ListView).first, const Offset(0, 1500));
      await tester.pump();
      expect(find.text('Saving to your account…'), findsOneWidget);
      expect(find.text(name), findsOneWidget);
      expect(find.text('Saved to your Event List.'), findsNothing);
      cloud.emit(cache: true);
      await tester.pump();
      expect(controller.saving, true);
      expect(controller.selectionCount, 1);
      cloud.emit(pending: true);
      await tester.pump();
      expect(controller.saving, true);
      expect(controller.selectionCount, 1);
      cloud.emit();
      await tester.pumpAndSettle();
      expect(find.text(name), findsNothing);
      expect(find.text('Your Event List is Empty'), findsOneWidget);
      expect(cloud.commands.single['action'], 'remove');
      expect(controller.saving, false);
      expect(controller.cloudServerConfirmed, true);
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      auth.dispose();
      await cloud.close();
    },
  );
}
