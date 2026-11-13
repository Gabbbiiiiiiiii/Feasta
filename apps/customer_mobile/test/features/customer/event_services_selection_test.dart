import 'package:feasta/core/widgets/badges/feasta_price_text.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/widgets/event_services_selection.dart';
import 'package:feasta/shared/models/feasta_models.dart';

AddonModel service(
  String id,
  String provider, {
  String? imageUrl,
  int? leadTimeDays,
}) => AddonModel(
  id: id,
  imageUrl: imageUrl,
  bookingLeadTimeDays: leadTimeDays,
  providerId: provider,
  name: 'Service $id',
  description: 'Description',
  category: 'Photography',
  price: 100,
  isAvailable: true,
  isActive: true,
  providerBusinessName: provider,
  providerType: 'addon_provider',
);
void main() {
  Future<void> open(
    WidgetTester tester,
    List<Map<String, dynamic>> selected, {
    double textScale = 1,
    Stream<List<AddonModel>>? catering,
    Stream<List<AddonModel>>? marketplace,
    Future<({bool available, String message})> Function(AddonModel)? check,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: Scaffold(
          body: SingleChildScrollView(
            child: EventServicesSelection(
              providerName: 'Caterer',
              providerId: 'caterer',
              catering: catering ?? Stream.value([service('own', 'caterer')]),
              marketplace:
                  marketplace ??
                  Stream.value(
                    List.generate(5, (i) => service('other$i', 'other')),
                  ),
              selected: selected,
              check:
                  check ?? (_) async => (available: true, message: 'Available'),
              onToggle: (id, addon, value) {
                selected.removeWhere((a) => a['addonId'] == id);
                if (value) {
                  selected.add(
                    addon!.toBookingMap(
                      source: addon.providerId == 'caterer'
                          ? 'catering_provider'
                          : 'feasta_addon_provider',
                    ),
                  );
                }
              },
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    if (catering == null && marketplace == null) await tester.pumpAndSettle();
  }

  testWidgets('late catalogs display inline without an empty caterer section', (
    tester,
  ) async {
    final catering = StreamController<List<AddonModel>>();
    final marketplace = StreamController<List<AddonModel>>();
    await open(
      tester,
      [],
      catering: catering.stream,
      marketplace: marketplace.stream,
    );
    catering.add([]);
    marketplace.add([service('late external', 'other')]);
    await tester.pumpAndSettle();
    expect(find.text('From Caterer'), findsNothing);
    expect(find.text('Service late external'), findsOneWidget);
    expect(find.text('Browse More Services'), findsNothing);
    expect(find.text('0 services selected'), findsOneWidget);
    expect(find.textContaining('/ 20'), findsNothing);
    expect(find.text('I will arrange my own add-ons'), findsNothing);
    expect(find.byType(TextField), findsNothing);
    await tester.pumpWidget(const SizedBox());
    unawaited(catering.close());
    unawaited(marketplace.close());
  });
  testWidgets('groups selection removal and subtotal', (tester) async {
    final selected = <Map<String, dynamic>>[];
    await open(tester, selected);
    expect(find.text('From Caterer'), findsOneWidget);
    expect(find.text('Other FEASTA event services'), findsOneWidget);
    await tester.ensureVisible(find.byType(Checkbox).first);
    await tester.tap(find.byType(Checkbox).first);
    await tester.pumpAndSettle();
    expect(selected.single['source'], 'catering_provider');
    expect(find.text('1 service selected'), findsOneWidget);
    await tester.ensureVisible(find.byTooltip('Remove Service own'));
    await tester.tap(find.byTooltip('Remove Service own'));
    await tester.pumpAndSettle();
    expect(selected, isEmpty);
  });
  testWidgets('unknown and unavailable prevent selection', (tester) async {
    final gate = Completer<({bool available, String message})>();
    await open(tester, [], check: (_) => gate.future);
    expect(
      tester.widget<Checkbox>(find.byType(Checkbox).first).onChanged,
      isNull,
    );
    gate.complete((available: false, message: 'Blocked date'));
    await tester.pumpAndSettle();
    expect(find.text('Blocked date'), findsWidgets);
    expect(
      tester.widget<Checkbox>(find.byType(Checkbox).first).onChanged,
      isNull,
    );
  });
  testWidgets('20 services blocks additions but permits removal', (
    tester,
  ) async {
    final selected = List.generate(
      20,
      (i) => service(i == 0 ? 'own' : 'saved$i', 'caterer').toBookingMap(),
    );
    await open(tester, selected);
    expect(
      tester.widgetList<Checkbox>(find.byType(Checkbox)).elementAt(1).onChanged,
      isNull,
    );
    await tester.ensureVisible(find.byType(Checkbox).first);
    await tester.tap(find.byType(Checkbox).first);
    await tester.pumpAndSettle();
    expect(selected.length, 19);
    expect(
      tester.widgetList<Checkbox>(find.byType(Checkbox)).elementAt(1).onChanged,
      isNotNull,
    );
  });
  testWidgets('all eligible other-provider services display inline', (
    tester,
  ) async {
    final selected = <Map<String, dynamic>>[];
    await open(tester, selected);
    expect(find.text('Service other4'), findsOneWidget);
    expect(find.text('Browse More Services'), findsNothing);
    await tester.ensureVisible(find.byType(Checkbox).last);
    await tester.tap(find.byType(Checkbox).last);
    await tester.pumpAndSettle();
    expect(selected.single['addonId'], 'other4');
    expect(selected.single['source'], 'feasta_addon_provider');
  });
  testWidgets(
    'marketplace selection preserves external source and expires checks',
    (tester) async {
      final selected = <Map<String, dynamic>>[];
      var calls = 0;
      await open(
        tester,
        selected,
        check: (_) async {
          calls++;
          return (available: true, message: 'Available');
        },
      );
      await tester.ensureVisible(find.byType(Checkbox).at(1));
      await tester.tap(find.byType(Checkbox).at(1));
      await tester.pumpAndSettle();
      expect(selected.single['source'], 'feasta_addon_provider');
      final before = calls;
      await tester.pump(const Duration(minutes: 4));
      await tester.pumpAndSettle();
      expect(calls, greaterThan(before));
    },
  );
  testWidgets(
    'published records, full width image fallback and restored subtotal at 320px and 200 percent',
    (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final selected = [
        service('own', 'caterer').toBookingMap(source: 'catering_provider'),
      ];
      await open(tester, selected, textScale: 2);
      expect(find.text('Service own'), findsWidgets);
      expect(find.text('Photography'), findsWidgets);
      expect(find.text('Description'), findsWidgets);
      expect(find.byIcon(Icons.event_outlined), findsWidgets);
      expect(
        tester.widget<AspectRatio>(find.byType(AspectRatio).first).aspectRatio,
        2,
      );
      expect(find.text('1 service selected'), findsOneWidget);
      await tester.ensureVisible(find.text('Displayed add-ons subtotal'));
      expect(find.text('Displayed add-ons subtotal'), findsOneWidget);
      expect(find.textContaining('100'), findsWidgets);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.byTooltip('Remove Service own'));
      await tester.tap(find.byTooltip('Remove Service own'));
      await tester.pumpAndSettle();
      expect(find.text('0 services selected'), findsOneWidget);
      expect(selected, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'advance booking response blocks additions and lets restored selection be removed',
    (tester) async {
      final selected = [service('own', 'caterer').toBookingMap()];
      await open(
        tester,
        selected,
        check: (_) async => (
          available: false,
          message: 'Requires at least 7 days advance booking.',
        ),
      );
      expect(
        find.textContaining('Selected, but no longer available.'),
        findsOneWidget,
      );
      expect(
        tester.widget<Checkbox>(find.byType(Checkbox).first).onChanged,
        isNotNull,
      );
      expect(
        tester.widget<Checkbox>(find.byType(Checkbox).at(1)).onChanged,
        isNull,
      );
      await tester.ensureVisible(find.byType(Checkbox).first);
      await tester.tap(find.byType(Checkbox).first);
      await tester.pumpAndSettle();
      expect(selected, isEmpty);
      expect(
        tester.widget<Checkbox>(find.byType(Checkbox).first).onChanged,
        isNull,
      );
    },
  );

  testWidgets('empty catalogs allow optional zero services', (tester) async {
    await open(
      tester,
      [],
      catering: Stream.value([]),
      marketplace: Stream.value([]),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('No eligible services are currently available.'),
      findsOneWidget,
    );
    expect(find.text('No event services selected.'), findsOneWidget);
    final panel = find
        .ancestor(
          of: find.text('SELECTED SERVICES'),
          matching: find.byType(Container),
        )
        .first;
    expect(
      find.descendant(
        of: panel,
        matching: find.text(
          'Event services are optional. You can continue without selecting any.',
        ),
      ),
      findsOneWidget,
    );
    expect(find.text(FeastaPriceFormatter.format(0)), findsOneWidget);
    expect(find.byType(Checkbox), findsNothing);
  });

  for (final days in [3, 7]) {
    testWidgets('only the matching $days day notice is deduplicated', (
      tester,
    ) async {
      await open(
        tester,
        [],
        catering: Stream.value([service('photo', 'caterer', leadTimeDays: 3)]),
        marketplace: Stream.value([]),
        check: (_) async => (
          available: true,
          message:
              'Available for your selected event. Requires booking at least $days days in advance. Venue restrictions still apply.',
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Requires booking at least 3 days in advance.'),
        findsOneWidget,
      );
      expect(
        find.text(
          days == 3
              ? 'Available for your selected event.  Venue restrictions still apply.'
              : 'Available for your selected event. Requires booking at least 7 days in advance. Venue restrictions still apply.',
        ),
        findsOneWidget,
      );
      expect(
        tester.widget<Checkbox>(find.byType(Checkbox)).onChanged,
        isNotNull,
      );
    });
  }

  testWidgets('availability errors retry without selecting a service', (
    tester,
  ) async {
    var attempts = 0;
    await open(
      tester,
      [],
      catering: Stream.value([service('own', 'caterer')]),
      marketplace: Stream.value([]),
      check: (_) async {
        if (attempts++ == 0) throw StateError('offline');
        return (available: true, message: 'Available');
      },
    );
    await tester.pumpAndSettle();
    expect(tester.widget<Checkbox>(find.byType(Checkbox)).onChanged, isNull);
    await tester.ensureVisible(find.text('Retry availability'));
    await tester.tap(find.text('Retry availability'));
    await tester.pumpAndSettle();
    expect(tester.widget<Checkbox>(find.byType(Checkbox)).onChanged, isNotNull);
    expect(find.text('0 services selected'), findsOneWidget);
  });
  testWidgets('updated catalog ignores a stale availability response', (
    tester,
  ) async {
    final catalog = StreamController<List<AddonModel>>();
    final old = service('own', 'caterer');
    final fresh = service('own', 'caterer');
    final pending = Completer<({bool available, String message})>();
    await open(
      tester,
      [],
      catering: catalog.stream,
      marketplace: Stream.value([]),
      check: (addon) => identical(addon, old)
          ? pending.future
          : Future.value((
              available: false,
              message: 'Updated record is unavailable',
            )),
    );
    catalog.add([old]);
    await tester.pump();
    catalog.add([fresh]);
    await tester.pumpAndSettle();
    pending.complete((available: true, message: 'Stale approval'));
    await tester.pumpAndSettle();
    expect(find.text('Updated record is unavailable'), findsOneWidget);
    expect(find.text('Stale approval'), findsNothing);
    expect(tester.widget<Checkbox>(find.byType(Checkbox)).onChanged, isNull);
    await tester.pumpWidget(const SizedBox());
    unawaited(catalog.close());
  });

  testWidgets('failed catalog retries its source', (tester) async {
    var attempts = 0;
    final catalog = Stream<List<AddonModel>>.multi((controller) {
      if (attempts++ == 0) {
        controller.addError(StateError('offline'));
      } else {
        controller.add([service('retry', 'caterer')]);
      }
      controller.close();
    });
    await open(tester, [], catering: catalog, marketplace: Stream.value([]));
    await tester.pumpAndSettle();
    expect(find.text('Services could not be loaded.'), findsOneWidget);
    await tester.tap(find.text('Retry From Caterer'));
    await tester.pumpAndSettle();
    expect(find.text('Service retry'), findsOneWidget);
    expect(attempts, 2);
  });
  testWidgets(
    'service uses published image URL and a failed image has a fallback',
    (tester) async {
      await open(
        tester,
        [],
        catering: Stream.value([
          service(
            'photo',
            'caterer',
            imageUrl: 'https://example.invalid/service.jpg',
          ),
        ]),
        marketplace: Stream.value([]),
      );
      await tester.pumpAndSettle();
      final image = tester.widget<Image>(find.byType(Image));
      expect(
        (image.image as NetworkImage).url,
        'https://example.invalid/service.jpg',
      );
      expect(image.fit, BoxFit.cover);
      final context = tester.element(find.byType(Image));
      final fallback = image.errorBuilder!(
        context,
        StateError('failed image'),
        null,
      );
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: fallback)));
      expect(find.byIcon(Icons.event_outlined), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'published advance-booking notice remains visible for an available service',
    (tester) async {
      await open(
        tester,
        [],
        catering: Stream.value([]),
        marketplace: Stream.value([
          service('portrait', 'Studio', leadTimeDays: 7),
        ]),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Requires booking at least 7 days in advance.'),
        findsOneWidget,
      );
      expect(find.text('Studio'), findsOneWidget);
      expect(find.text('Photography'), findsOneWidget);
      expect(
        tester.widget<Checkbox>(find.byType(Checkbox)).onChanged,
        isNotNull,
      );
      expect(find.text('From Caterer'), findsNothing);
    },
  );
  testWidgets('selection and deselection update the exact displayed subtotal', (
    tester,
  ) async {
    final selected = <Map<String, dynamic>>[];
    await open(tester, selected);
    await tester.ensureVisible(find.byType(Checkbox).first);
    await tester.tap(find.byType(Checkbox).first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byType(Checkbox).at(1));
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    expect(find.text('2 services selected'), findsOneWidget);
    expect(find.text(FeastaPriceFormatter.format(200)), findsOneWidget);
    await tester.ensureVisible(find.byType(Checkbox).first);
    await tester.tap(find.byType(Checkbox).first);
    await tester.pumpAndSettle();
    expect(find.text('1 service selected'), findsOneWidget);
    expect(find.text(FeastaPriceFormatter.format(200)), findsNothing);
    expect(selected.single['addonId'], 'other0');
  });
}
