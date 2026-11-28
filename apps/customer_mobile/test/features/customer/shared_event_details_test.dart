import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:feasta/features/customer/event_list/shared_event_details.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/shared/models/provider_calendar_month.dart';
import 'event_list_configuration_codec_test.dart' show configuration;
import 'customer_event_list_test.dart' show EventAuth, MemoryEventStorage;
import 'event_draft_persistence_test.dart' show DraftStore;
import 'booking_preparation_test.dart' show preparationPackage;
import 'booking_preparation_flow_test.dart'
    show PreparationAuth, PreparationRepository, seedDraft;
import 'provider_discovery_test.dart' show GuestAuth, provider;

class CalendarRepository extends PreparationRepository {
  bool blocked = false;
  Completer<ProviderCalendarMonth>? gate;
  @override
  Future<ProviderCalendarMonth> getProviderCalendarMonth(
    String providerId,
    String month,
  ) async =>
      gate?.future ??
      ProviderCalendarMonth.parse({
        'month': month,
        'dates': [
          if (blocked) {'date': '2030-06-20', 'state': 'unavailable'},
        ],
      }, month);
}

CustomerEventListEntry source({
  String date = '2030-06-20',
  String id = 'package_source',
}) {
  final value = configuration();
  value['event']['eventDate'] = date;
  value['event']['eventType'] = 'Wedding';
  return CustomerEventListEntry(
    providerId: 'provider_source',
    packageId: id,
    packageName: 'Source',
    providerName: 'Saved provider',
    configuration: CustomerEventListConfiguration.fromJson(value),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  late EventAuth auth;
  late EventListController list;
  late CalendarRepository repository;
  void reset() {
    GuestAuth.signedIn = true;
    PreparationAuth.owner = 'customer-1';
    auth = EventAuth()..switchTo('customer-1');
    list = EventListController(
      store: EventListStore(storage: MemoryEventStorage()),
      authentication: auth,
    );
    eventDraftPersistence = EventDraftPersistence(DraftStore());
    repository = CalendarRepository();
  }

  setUp(reset);
  tearDown(() {
    list.dispose();
    auth.dispose();
  });
  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      EventListScope(
        controller: list,
        child: MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repository,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  test(
    'deduplicates equal plans, exposes conflicts and excludes target provider',
    () {
      expect(
        sharedEventCandidates([
          source(),
          source(id: 'duplicate_package'),
        ], 'caterer-1'),
        hasLength(1),
      );
      expect(
        sharedEventCandidates([
          source(),
          source(date: '2030-06-21', id: 'other_package'),
        ], 'caterer-1'),
        hasLength(2),
      );
      expect(sharedEventCandidates([source()], 'provider_source'), isEmpty);
      final values = compatibleSharedEvent(
        source().configuration!.event,
        eventTypes: ['Birthday'],
        minimum: 1,
        maximum: 50,
        now: DateTime(2031),
      );
      expect(values.keys, unorderedEquals(['eventLocation', 'eventAddress']));
      expect(
        sharedEventDetails(source().configuration!.event),
        isNot(contains('specialRequest')),
      );
    },
  );
  final scenarios = <(String, Future<void> Function(WidgetTester))>[];
  scenarios.add((
    'accepts shared event fields, leaves package choices and saved source intact',
    (tester) async {
      await list.addPackage(source());
      final before = jsonEncode(list.list!.toJson());
      await open(tester);
      await tester.tap(find.textContaining('Use Saved provider:'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Event hall'), findsOneWidget);
      expect(jsonEncode(list.list!.toJson()), before);
      expect(find.textContaining('Reuse your saved'), findsNothing);
    },
  ));
  scenarios.add((
    'decline leaves manual details unchanged',
    (tester) async {
      await list.addPackage(source());
      await open(tester);
      await tester.tap(find.text('Enter new details'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Event hall'), findsNothing);
      expect(find.textContaining('Use Saved provider:'), findsNothing);
    },
  ));
  scenarios.add((
    'unavailable date is omitted for the new provider',
    (tester) async {
      repository.blocked = true;
      await list.addPackage(source());
      await open(tester);
      await tester.tap(find.textContaining('Use Saved provider:'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Event hall'), findsOneWidget);
      expect(find.text('Select event date'), findsWidgets);
    },
  ));
  scenarios.add((
    'source removal during a calendar check cancels prefill',
    (tester) async {
      final entry = source();
      await list.addPackage(entry);
      await open(tester);
      repository.gate = Completer<ProviderCalendarMonth>();
      await tester.tap(find.textContaining('Use Saved provider:'));
      await tester.pump();
      await list.removePackage(entry.identity);
      repository.gate!.complete(
        ProviderCalendarMonth.parse({
          'month': '2030-06',
          'dates': [],
        }, '2030-06'),
      );
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Event hall'), findsNothing);
    },
  ));
  scenarios.add((
    'conflicts require explicit selection',
    (tester) async {
      await list.addPackage(source());
      await list.addPackage(source(date: '2030-06-21', id: 'other_package'));
      await open(tester);
      expect(
        find.textContaining('Saved event details conflict.'),
        findsOneWidget,
      );
      expect(find.textContaining('Use Saved provider:'), findsNWidgets(2));
      expect(find.widgetWithText(TextField, 'Event hall'), findsNothing);
    },
  ));
  scenarios.add((
    'account switch and logout hide saved details',
    (tester) async {
      await list.addPackage(source());
      await open(tester);
      auth.switchTo('customer-2');
      await tester.pumpAndSettle();
      expect(find.textContaining('Use Saved provider:'), findsNothing);
      auth.switchTo(null);
      GuestAuth.signedIn = false;
      await tester.pumpAndSettle();
      expect(find.textContaining('Use Saved provider:'), findsNothing);
    },
  ));
  scenarios.add((
    'removed sources cannot be reused',
    (tester) async {
      final entry = source();
      await list.addPackage(entry);
      await open(tester);
      await list.removePackage(entry.identity);
      await tester.pumpAndSettle();
      expect(find.textContaining('Use Saved provider:'), findsNothing);
    },
  ));
  scenarios.add((
    'existing draft takes priority',
    (tester) async {
      await seedDraft();
      await list.addPackage(source());
      await open(tester);
      expect(find.textContaining('Use Saved provider:'), findsNothing);
      expect(find.text('Draft recovered'), findsOneWidget);
    },
  ));
  // EventListStore serializes globally. Keep these UI scenarios in one fake
  // async zone so its queue never depends on a disposed test clock.
  testWidgets(
    'shared event reuse: accept, decline, conflict, account changes, stale source, provider calendar and draft preservation',
    (tester) async {
      for (final scenario in scenarios) {
        await scenario.$2(tester);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        list.dispose();
        auth.dispose();
        reset();
      }
    },
  );
}
