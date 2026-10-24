import 'dart:async';
import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages, implementation_imports
import 'package:cloud_functions_platform_interface/src/pigeon/messages.pigeon.dart'
    as functions_host;
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feasta/app/router/customer_auth_navigation.dart';
import 'package:feasta/core/security/customer_session_coordinator.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:feasta/features/customer/addon_marketplace_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/features/customer/booking_agreement_review_screen.dart';
import 'package:feasta/features/customer/booking_refund_policy_review_screen.dart';
import 'package:feasta/features/customer/customization_session.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'package:feasta/features/customer/event_list/customer_event_list_screen.dart';
import 'package:feasta/features/customer/event_list/event_list_catalog.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/location_picker_screen.dart';
import 'package:feasta/features/customer/manual_address_screen.dart';
import 'package:feasta/features/customer/package_details_screen.dart';
import 'package:feasta/features/authentication/data/services/maps_api_service.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'package:feasta/shared/models/event_customization_data.dart';
import 'booking_attempt_test.dart' show MemoryStore;
import 'booking_preparation_flow_test.dart'
    show PreparationAuth, readyPreparationSessions, seedDraft, openStep;
import 'booking_preparation_test.dart' show preparationPackage;
import 'customer_event_list_test.dart' show MemoryEventStorage;
import 'event_draft_persistence_test.dart' show DraftStore;
import 'event_list_catalog_test.dart' show saved;
import 'event_list_customization_ui_test.dart' show HandoffRepository;
import 'location_picker_selection_test.dart' show FakeMaps, FakeLocation;
import 'provider_discovery_test.dart' show GuestAuth, provider;

class DescendantRepository extends HandoffRepository {
  @override
  Stream<List<AddonModel>> marketplaceAddons() => Stream.value([]);
}

class HeldAttemptStore extends MemoryStore {
  Completer<void>? readGate;
  int reads = 0, writes = 0;
  @override
  Future<String?> read(String uid) async {
    reads++;
    await readGate?.future;
    return super.read(uid);
  }

  @override
  Future<void> write(String uid, String value) async {
    writes++;
    await super.write(uid, value);
  }
}

class HeldMaps extends FakeMaps {
  int searches = 0;
  Completer<List<PlaceSearchResult>>? searchGate;
  @override
  Future<List<PlaceSearchResult>> searchPlaces(String query) {
    searches++;
    return searchGate?.future ?? super.searchPlaces(query);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  const privateAddress = 'Private venue A 771';
  const privateNotes = 'Private notes A 991';
  const privateStreet = 'Private street A 887';
  final venue = CustomerAddressModel.defaultOrmoc.copyWith(
    id: 'private-pin',
    fullAddress: privateAddress,
    streetName: privateStreet,
    city: 'Ormoc City',
    latitude: 10.9,
    longitude: 124.4,
  );
  late CustomerSessionCoordinator sessions;
  late CustomizationSession session;
  late CustomerSessionEventListAuthentication auth;
  late EventListController list;
  late DescendantRepository repo;
  late GlobalKey<NavigatorState> key;
  late HeldAttemptStore attemptsStore;
  late BookingAttemptCoordinator attempts;
  late HeldMaps maps;
  late FakeLocation gps;
  late GoogleMap map;
  late DraftStore drafts;
  int nativeAttemptCalls = 0;
  Completer<Object?>? disclosureGate;
  const callableChannel = BasicMessageChannel<Object?>(
    'dev.flutter.pigeon.cloud_functions_platform_interface.CloudFunctionsHostApi.call',
    functions_host.CloudFunctionsHostApi.pigeonChannelCodec,
  );
  void reset() {
    SharedPreferences.setMockInitialValues({});
    GuestAuth.signedIn = true;
    PreparationAuth.owner = 'customer-1';
    sessions = readyPreparationSessions();
    final captured = sessions.readSnapshot();
    session = CustomizationSession(
      uid: captured.customerUid!,
      generation: captured.generation,
      changes: sessions,
      isCurrent: () => sessions.isCurrent(captured),
    );
    auth = CustomerSessionEventListAuthentication(sessions);
    list = EventListController(
      store: EventListStore(storage: MemoryEventStorage()),
      authentication: auth,
    );
    repo = DescendantRepository();
    key = GlobalKey<NavigatorState>();
    attemptsStore = HeldAttemptStore();
    attempts = BookingAttemptCoordinator(
      store: attemptsStore,
      currentUid: () => GuestAuth.signedIn ? PreparationAuth.owner : null,
    );
    maps = HeldMaps();
    gps = FakeLocation();
    drafts = DraftStore();
    eventDraftPersistence = EventDraftPersistence(drafts);
    nativeAttemptCalls = 0;
    disclosureGate = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockDecodedMessageHandler<Object?>(callableChannel, (
          message,
        ) async {
          final name = ((message as List).single as Map)['functionName'];
          expect(
            name,
            anyOf(
              'getBookingPaymentAgreementDisclosures',
              'getBookingRefundPolicyDisclosures',
            ),
          );
          return disclosureGate?.future ??
              Future<Object?>.value([
                'unavailable',
                'Controlled disclosure response',
                null,
              ]);
        });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(
        const MethodChannel('feasta/maps_configuration'),
        (_) async => true,
      )
      ..setMockMethodCallHandler(
        const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
        (_) async {
          nativeAttemptCalls++;
          throw StateError('Unexpected native attempt');
        },
      );
  }

  void replace(String kind) {
    if (kind == 'suspend') {
      sessions.suspend();
      return;
    }
    sessions.invalidate();
    if (kind == 'A to B' || kind == 'A to B to A') {
      PreparationAuth.owner = 'customer-2';
      sessions.observeIdentity('customer-2');
      sessions.completeValidation(
        sessions.beginValidation(),
        validatedUid: 'customer-2',
        authorizedCustomer: true,
      );
    }
    if (kind == 'same UID' || kind == 'A to B to A') {
      if (kind == 'A to B to A') {
        sessions.invalidate();
        PreparationAuth.owner = 'customer-1';
        sessions.observeIdentity('customer-1');
      }
      sessions.completeValidation(
        sessions.beginValidation(),
        validatedUid: 'customer-1',
        authorizedCustomer: true,
      );
    }
  }

  Future<void> shell(WidgetTester tester) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    await tester.pumpWidget(
      EventListScope(
        controller: list,
        child: MaterialApp(
          navigatorKey: key,
          home: const Scaffold(body: Text('Persistent root')),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  String semantics(WidgetTester tester) {
    final buffer = StringBuffer();
    void visit(SemanticsNode node) {
      final data = node.getSemanticsData();
      buffer.writeln('${data.label} ${data.value} ${data.hint}');
      node.visitChildren((child) {
        visit(child);
        return true;
      });
    }

    visit(
      tester
          .binding
          .renderViews
          .single
          .owner!
          .semanticsOwner!
          .rootSemanticsNode!,
    );
    return buffer.toString();
  }

  void hidden(WidgetTester tester) {
    for (final value in [
      privateAddress,
      privateNotes,
      privateStreet,
      '14:13',
      'May 12, 2035',
      'Private menu A',
    ]) {
      expect(find.textContaining(value), findsNothing);
      expect(semantics(tester), isNot(contains(value)));
    }
    expect(find.text('Prepare request identity'), findsNothing);
    expect(find.text('Confirm Event Location'), findsNothing);
    expect(find.byKey(const ValueKey('map-surface')), findsNothing);
    expect(
      find.text('Please sign in again to continue preparing your event.'),
      findsOneWidget,
    );
  }

  Future<void> summary(WidgetTester tester) async {
    await shell(tester);
    key.currentState!.push<void>(
      MaterialPageRoute(
        builder: (_) => BookingSummaryScreen(
          session: session,
          attempts: attempts,
          provider: provider(),
          eventPackage: preparationPackage(),
          customization: EventCustomizationData(
            eventType: 'Wedding',
            eventDate: DateTime(2035, 5, 12),
            eventTime: '14:13',
            eventEndTime: '18:17',
            guestCount: 55,
            eventLocation: 'Ormoc City',
            eventAddress: privateAddress,
            selectedFoods: const ['Private menu A'],
            selectedDecorations: const ['Flowers'],
            selectedFurniture: const ['Tables'],
            selectedAddOns: const [],
            willArrangeOwnAddOns: false,
            customerArrangedAddOnsNote: '',
            specialRequest: privateNotes,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(privateAddress), findsOneWidget);
    expect(find.text(privateNotes), findsOneWidget);
    expect(find.text('Private menu A'), findsOneWidget);
    expect(semantics(tester), contains('14:13'));
    expect(semantics(tester), contains('May 12, 2035'));
    expect(semantics(tester), contains(privateAddress));
    expect(attemptsStore.reads, 0);
  }

  Future<void> picker(WidgetTester tester) async {
    await shell(tester);
    key.currentState!.push<CustomerAddressModel>(
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          session: session,
          sessionOnly: true,
          initialAddress: venue,
          mapsApiService: maps,
          locationService: gps,
          mapBuilder: (value) {
            map = value;
            return const ColoredBox(
              key: ValueKey('map-surface'),
              color: Colors.blue,
            );
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(privateAddress), findsOneWidget);
    expect(semantics(tester), contains(privateAddress));
  }

  Future<CustomizationSession> productionCustomization(
    WidgetTester tester,
    String entry,
  ) async {
    await seedDraft();
    final draft = (await eventDraftPersistence.read(
      'customer-1',
      'caterer-1',
      'package-1',
    ))!;
    await eventDraftPersistence.save('customer-1', 'caterer-1', 'package-1', {
      ...draft,
      'notes': privateNotes,
      'address': privateAddress,
      'eventAddress': venue,
    }, () => 'customer-1');
    await list.addPackage(saved());
    await shell(tester);
    key.currentState!.push<void>(
      MaterialPageRoute(
        builder: (_) => entry == 'Event List'
            ? CustomerEventListScreen(
                repository: repo,
                catalog: EventListCatalog(lookup: (_, _) async => null),
              )
            : PackageDetailsScreen(
                provider: provider(),
                eventPackage: preparationPackage(),
                repository: repo,
                sessions: sessions,
              ),
      ),
    );
    await tester.pumpAndSettle();
    final action = find.text(
      entry == 'Event List' ? 'Customize Package' : 'Select Package',
    );
    await tester.ensureVisible(action);
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();
    return tester
        .widget<EventCustomizationScreen>(find.byType(EventCustomizationScreen))
        .session!;
  }

  final scenarios = <String, Future<void> Function(WidgetTester)>{};
  void scenario(String name, Future<void> Function(WidgetTester) body) =>
      scenarios[name] = body;

  for (final kind in [
    'invalidate',
    'A to B',
    'A to B to A',
    'same UID',
    'suspend',
  ]) {
    scenario(
      'open Review Event conceals content and rejects retained Prepare: $kind',
      (tester) async {
        final handle = tester.ensureSemantics();
        await summary(tester);
        final route = ModalRoute.of(
          tester.element(find.byType(BookingSummaryScreen)),
        )!;
        final prepare = tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Prepare request identity'),
            )
            .onPressed!;
        replace(kind);
        prepare(); // Also rejects a callback retained before the next frame.
        await tester.pumpAndSettle();
        expect(
          route.isCurrent,
          isTrue,
        ); // The private route was not popped first.
        expect(session.authorized, isFalse);
        hidden(tester);
        prepare();
        await tester.pumpAndSettle();
        expect(attemptsStore.reads, 0);
        expect(attemptsStore.writes, 0);
        expect(nativeAttemptCalls, 0);
        hidden(tester);
        handle.dispose();
      },
    );
  }
  scenario(
    'queued Prepare is rejected on same UID replacement without publishing',
    (tester) async {
      final handle = tester.ensureSemantics();
      await summary(tester);
      final gate = Completer<void>();
      attemptsStore.readGate = gate;
      await tester.tap(find.text('Prepare request identity'));
      await tester.pump();
      expect(attemptsStore.reads, 1);
      replace('same UID');
      await tester.pumpAndSettle();
      hidden(tester);
      gate.complete();
      await tester.pumpAndSettle();
      expect(attemptsStore.writes, 0);
      hidden(tester);
      expect(
        find.textContaining('Request identity saved securely'),
        findsNothing,
      );
      handle.dispose();
    },
  );
  scenario(
    'authorized explicit Prepare preserves stable identity and opening never writes',
    (tester) async {
      final handle = tester.ensureSemantics();
      await summary(tester);
      expect(attemptsStore.writes, 0);
      await tester.tap(find.text('Prepare request identity'));
      await tester.pumpAndSettle();
      final first = jsonDecode(attemptsStore.values['customer-1']!) as Map;
      await tester.tap(find.text('Prepare request identity'));
      await tester.pumpAndSettle();
      final second = jsonDecode(attemptsStore.values['customer-1']!) as Map;
      expect(first['clientRequestId'], second['clientRequestId']);
      expect(attemptsStore.values.keys, ['customer-1']);
      expect(nativeAttemptCalls, 0);
      key.currentState!.pop();
      await tester.pumpAndSettle();
      expect(find.text('Persistent root'), findsOneWidget);
      handle.dispose();
    },
  );
  for (final kind in ['A to B', 'same UID', 'suspend']) {
    scenario(
      'open Maps conceals address and rejects retained marker/confirm: $kind',
      (tester) async {
        final handle = tester.ensureSemantics();
        // Start setup without flattening/awaiting its route-result Future.
        await picker(tester);
        final route = ModalRoute.of(
          tester.element(find.byType(LocationPickerScreen)),
        )!;
        final confirm = tester
            .widget<LocationActionPanel>(find.byType(LocationActionPanel))
            .onConfirm;
        final oldMap = map;
        replace(kind);
        confirm();
        oldMap.onTap!(const LatLng(11, 124));
        await tester.pumpAndSettle();
        expect(route.isCurrent, isTrue);
        hidden(tester);
        expect(maps.requests, isEmpty);
        handle.dispose();
      },
    );
  }
  for (final work in ['debounce', 'search', 'details', 'reverse', 'GPS']) {
    scenario('Maps rejects old $work callback after invalidation', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await picker(tester);
      if (work == 'debounce' || work == 'search') {
        maps.searchGate = Completer<List<PlaceSearchResult>>();
        await tester.enterText(find.byType(TextField), 'Private query');
        if (work == 'search') {
          await tester.pump(const Duration(milliseconds: 421));
        }
      } else if (work == 'details') {
        await tester.enterText(find.byType(TextField), 'venue');
        await tester.pump(const Duration(milliseconds: 421));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Venue result'));
        await tester.pump();
      } else if (work == 'reverse') {
        map.onTap!(const LatLng(10.8, 124.3));
        await tester.pump();
      } else {
        tester
            .widget<LocationActionPanel>(find.byType(LocationActionPanel))
            .onUseCurrentLocation();
        await tester.pump();
      }
      replace('same UID');
      await tester.pumpAndSettle();
      hidden(tester);
      if (work == 'debounce') {
        await tester.pump(const Duration(milliseconds: 500));
        expect(maps.searches, 0);
      } else if (work == 'search') {
        maps.searchGate!.complete(const [
          PlaceSearchResult(
            placeId: 'private',
            mainText: privateAddress,
            secondaryText: privateNotes,
            fullAddress: privateAddress,
          ),
        ]);
      } else if (work == 'details') {
        maps.details.complete(venue);
      } else if (work == 'reverse') {
        maps.requests.single.complete(venue);
      } else {
        gps.position.complete(
          Position(
            latitude: 10.7,
            longitude: 124.2,
            timestamp: DateTime.now(),
            accuracy: 10,
            altitude: 0,
            altitudeAccuracy: 0,
            heading: 0,
            headingAccuracy: 0,
            speed: 0,
            speedAccuracy: 0,
          ),
        );
      }
      await tester.pumpAndSettle();
      hidden(tester);
      if (work == 'GPS') expect(maps.requests, isEmpty);
      handle.dispose();
    });
  }
  scenario(
    'nested Maps manual edit is concealed while its route remains open',
    (tester) async {
      final handle = tester.ensureSemantics();
      await picker(tester);
      tester
          .widget<LocationActionPanel>(find.byType(LocationActionPanel))
          .onEditAddress(venue);
      await tester.pumpAndSettle();
      expect(find.byType(ManualAddressScreen), findsOneWidget);
      expect(find.text(privateStreet), findsOneWidget);
      final route = ModalRoute.of(
        tester.element(find.byType(ManualAddressScreen)),
      )!;
      replace('A to B');
      await tester.pumpAndSettle();
      expect(route.isCurrent, isTrue);
      hidden(tester);
      expect(find.byType(ManualAddressScreen), findsNothing);
      key.currentState!.pop(venue);
      await tester.pumpAndSettle();
      expect(find.byType(LocationPickerScreen), findsOneWidget);
      hidden(tester);
      handle.dispose();
    },
  );
  for (final disclosure in [
    'Review Booking & Payment Agreements',
    'Review Refund Policies',
  ]) {
    scenario(
      'nested Review Event disclosure is unmounted on session closure: $disclosure',
      (tester) async {
        final handle = tester.ensureSemantics();
        await summary(tester);
        disclosureGate = Completer<Object?>();
        await tester.ensureVisible(find.text(disclosure));
        await tester.pumpAndSettle();
        await tester.tap(find.text(disclosure));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        final finder = disclosure.contains('Agreements')
            ? find.byType(BookingAgreementReviewScreen)
            : find.byType(BookingRefundPolicyReviewScreen);
        expect(finder, findsOneWidget);
        final route = ModalRoute.of(tester.element(finder))!;
        replace('same UID');
        await tester.pumpAndSettle();
        expect(route.isCurrent, isTrue);
        expect(finder, findsNothing);
        hidden(tester);
        disclosureGate!.complete([
          'unavailable',
          'Old disclosure response',
          null,
        ]);
        await tester.pumpAndSettle();
        hidden(tester);
        handle.dispose();
      },
    );
  }
  scenario('authorized Maps returns complete address and coordinates', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await picker(tester);
    CustomerAddressModel? returned;
    // Observe the already installed production route, not a mocked callback.
    ModalRoute.of(
      tester.element(find.byType(LocationPickerScreen)),
    )!.popped.then((value) => returned = value as CustomerAddressModel?);
    await tester.tap(find.text('Confirm Event Location'));
    await tester.pumpAndSettle();
    expect(returned!.fullAddress, venue.fullAddress);
    expect(returned!.streetName, venue.streetName);
    expect(returned!.latitude, venue.latitude);
    expect(returned!.longitude, venue.longitude);
    // ignore: invalid_use_of_protected_member
    expect(session.hasListeners, isFalse);
    expect(
      returned!.toMap(),
      venue.copyWith(isDefault: true, createdAt: returned!.createdAt).toMap(),
    );
    expect(find.text('Persistent root'), findsOneWidget);
    handle.dispose();
  });

  for (final entry in ['Event List', 'Package Details']) {
    scenario(
      '$entry production handoff passes original binding into open Review Event',
      (tester) async {
        final handle = tester.ensureSemantics();
        final original = await productionCustomization(tester, entry);
        await openStep(tester, '3');
        await tester.tap(find.text('Review Event'));
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<BookingSummaryScreen>(find.byType(BookingSummaryScreen))
              .session,
          same(original),
        );
        expect(find.text(privateNotes), findsOneWidget);
        final prepare = tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Prepare request identity'),
            )
            .onPressed!;
        replace('A to B');
        prepare();
        await tester.pumpAndSettle();
        hidden(tester);
        expect(nativeAttemptCalls, 0);
        final exit = returnToCustomerRoot(key.currentState!);
        await tester.pumpAndSettle();
        expect(await exit, isTrue);
        expect(find.text('Persistent root'), findsOneWidget);
        handle.dispose();
      },
    );
  }
  for (final entry in ['Event List', 'Package Details']) {
    scenario('$entry production Maps inherits the original binding', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      final original = await productionCustomization(tester, entry);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            const MethodChannel('feasta/maps_configuration'),
            (_) async => false,
          );
      final action = find.text('View or Edit Map Location');
      await tester.scrollUntilVisible(
        action,
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(action);
      await tester.pumpAndSettle();
      await tester.tap(action);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<LocationPickerScreen>(find.byType(LocationPickerScreen))
            .session,
        same(original),
      );
      expect(find.text(privateAddress), findsOneWidget);
      replace('same UID');
      await tester.pumpAndSettle();
      hidden(tester);
      final exit = returnToCustomerRoot(key.currentState!);
      await tester.pumpAndSettle();
      expect(await exit, isTrue);
      expect(find.text('Persistent root'), findsOneWidget);
      handle.dispose();
    });
  }
  for (final kind in [
    'date',
    'start time',
    'end time',
    'manual address',
    'discard',
    'marketplace',
  ]) {
    scenario(
      'production customization $kind route conceals on generation replacement',
      (tester) async {
        final handle = tester.ensureSemantics();
        await productionCustomization(tester, 'Event List');
        Finder target;
        if (kind == 'date') {
          target = find.byIcon(Icons.calendar_today_outlined);
        } else if (kind == 'start time' || kind == 'end time') {
          target = find.text(kind == 'start time' ? '2:00 PM' : '6:00 PM');
        } else if (kind == 'manual address') {
          target = find.text('Enter address manually');
        } else if (kind == 'discard') {
          target = find.text('Discard unfinished draft');
        } else {
          await openStep(tester, '3');
          final title = find.text('FEASTA add-on marketplace');
          await tester.scrollUntilVisible(
            title,
            150,
            scrollable: find.byType(Scrollable).first,
          );
          target = find.descendant(
            of: find.ancestor(of: title, matching: find.byType(Row)).first,
            matching: find.byType(Switch),
          );
        }
        await tester.scrollUntilVisible(
          target,
          120,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.ensureVisible(target);
        await tester.pumpAndSettle();
        await tester.tap(target);
        await tester.pumpAndSettle();
        final privateRoute = ModalRoute.of(
          tester.element(
            kind == 'date'
                ? find.byType(DatePickerDialog)
                : kind.contains('time')
                ? find.byType(TimePickerDialog)
                : kind == 'manual address'
                ? find.byType(ManualAddressScreen)
                : kind == 'discard'
                ? find.byType(AlertDialog)
                : find.byType(AddonMarketplaceScreen),
          ),
        )!;
        replace('same UID');
        await tester.pumpAndSettle();
        expect(privateRoute.isCurrent, isTrue);
        hidden(tester);
        expect(find.byType(DatePickerDialog), findsNothing);
        expect(find.byType(TimePickerDialog), findsNothing);
        expect(find.byType(ManualAddressScreen), findsNothing);
        expect(find.byType(AddonMarketplaceScreen), findsNothing);
        handle.dispose();
      },
    );
  }
  scenario(
    'normal Review disposal cancels pending preparation before later reauthorization',
    (tester) async {
      final handle = tester.ensureSemantics();
      await summary(tester);
      final gate = Completer<void>();
      attemptsStore.readGate = gate;
      await tester.tap(find.text('Prepare request identity'));
      await tester.pump();
      key.currentState!.pop();
      await tester.pumpAndSettle();
      expect(find.text('Persistent root'), findsOneWidget);
      replace('same UID');
      gate.complete();
      await tester.pumpAndSettle();
      expect(attemptsStore.writes, 0);
      expect(tester.takeException(), isNull);
      handle.dispose();
    },
  );

  scenario(
    'disposing descendants releases listeners and rejects held preparation',
    (tester) async {
      final handle = tester.ensureSemantics();
      await summary(tester);
      final gate = Completer<void>();
      attemptsStore.readGate = gate;
      await tester.tap(find.text('Prepare request identity'));
      await tester.pump();
      session.close();
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      gate.complete();
      await tester.pumpAndSettle();
      // Inspect actual ChangeNotifier listener cleanup after route disposal.
      // ignore: invalid_use_of_protected_member
      expect(session.hasListeners, isFalse);
      expect(attemptsStore.writes, 0);
      expect(tester.takeException(), isNull);
      handle.dispose();
    },
  );

  testWidgets(
    'open customization descendants: privacy, preparation and nested routes',
    (tester) async {
      for (final item in scenarios.entries) {
        reset();
        try {
          await item.value(tester);
          debugPrint('SCENARIO PASS: ${item.key}');
        } catch (error, stack) {
          fail('${item.key}: $error\n$stack');
        } finally {
          await tester.pumpWidget(const SizedBox());
          await tester.pumpAndSettle();
          list.dispose();
          auth.dispose();
          session.dispose();
          GuestAuth.signedIn = false;
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        }
      }
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        ..setMockDecodedMessageHandler<Object?>(callableChannel, null)
        ..setMockMethodCallHandler(
          const MethodChannel('feasta/maps_configuration'),
          null,
        )
        ..setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          null,
        );
    },
  );
}
