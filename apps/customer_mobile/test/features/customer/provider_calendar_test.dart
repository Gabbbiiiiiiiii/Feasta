import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/core/theme/app_colors.dart';
import 'package:feasta/features/customer/widgets/provider_calendar.dart';
import 'package:feasta/shared/models/provider_calendar_month.dart';

ProviderCalendarMonth month(
  String key, [
  List<Map<String, String>> dates = const [],
]) => ProviderCalendarMonth.parse({'month': key, 'dates': dates}, key);

void main() {
  final today = DateTime(2026, 11, 12);
  test('strict response parsing and Manila civil dates', () {
    expect(manilaToday(DateTime.utc(2026, 11, 12, 18)), DateTime(2026, 11, 13));
    expect(
      month('2026-11').status(today, today: today),
      CalendarAvailability.unavailable,
    );
    expect(
      month('2026-11').status(DateTime(2026, 11, 13), today: today),
      CalendarAvailability.available,
    );
    expect(
      month('2026-11').status(DateTime(2026, 12, 13), today: today),
      CalendarAvailability.unknown,
    );
    for (final dates in [
      [
        {'date': '2026-11-31', 'state': 'booked'},
      ],
      [
        {'date': '2026-12-01', 'state': 'booked'},
      ],
      [
        {'date': '2026-11-13', 'state': 'available'},
      ],
      [
        {'date': '2026-11-13', 'state': 'booked'},
        {'date': '2026-11-13', 'state': 'on_hold'},
      ],
    ]) {
      expect(() => month('2026-11', dates), throwsFormatException);
    }
    expect(
      () => ProviderCalendarMonth.parse({
        'month': '2026-10',
        'dates': [],
      }, '2026-11'),
      throwsFormatException,
    );
  });

  Future<void> render(
    WidgetTester tester,
    CalendarMonthLoader loader, {
    DateTime? selected,
    String provider = 'provider-a',
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ProviderCalendar(
            providerId: provider,
            loadMonth: loader,
            selectedDate: selected,
            today: today,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'Sunday grid, statuses, past dates, restored selection and rejection',
    (tester) async {
      await render(
        tester,
        (_, key) async => month(key, [
          {'date': '2026-11-14', 'state': 'booked'},
          {'date': '2026-11-15', 'state': 'on_hold'},
          {'date': '2026-11-16', 'state': 'unavailable'},
        ]),
        selected: DateTime(2026, 11, 14),
      );
      expect(find.text('November 2026'), findsOneWidget);
      for (final day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
        expect(find.text(day), findsOneWidget);
      }
      expect(find.text('Sat, Nov 14: Booked'), findsOneWidget);
      FilledButton confirm() =>
          tester.widget(find.widgetWithText(FilledButton, 'Use selected date'));
      expect(confirm().onPressed, isNull);
      for (final day in ['11', '12', '15', '16']) {
        await tester.tap(find.text(day));
        await tester.pumpAndSettle();
        expect(confirm().onPressed, isNull);
      }
      await tester.tap(find.text('13'));
      await tester.pumpAndSettle();
      expect(confirm().onPressed, isNotNull);
      expect(find.text('Fri, Nov 13: Available'), findsOneWidget);
      final materials = tester.widgetList<Material>(
        find.ancestor(of: find.text('13'), matching: find.byType(Material)),
      );
      expect(materials.any((m) => m.color == AppColors.primary), isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('loading and failure remain unknown, retry resolves', (
    tester,
  ) async {
    final pending = Completer<ProviderCalendarMonth>();
    var attempts = 0;
    await render(
      tester,
      (_, key) => ++attempts == 1 ? pending.future : Future.value(month(key)),
    );
    expect(find.text('Loading availability…'), findsOneWidget);
    await tester.tap(find.text('13'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    pending.completeError(StateError('offline'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Couldn’t load dates'), findsOneWidget);
    await tester.tap(find.text('13'));
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    await tester.pumpAndSettle();
    await tester.tap(find.text('13'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNotNull,
    );
  });

  testWidgets('month and provider changes ignore stale results', (
    tester,
  ) async {
    final requests = <String, Completer<ProviderCalendarMonth>>{};
    Future<ProviderCalendarMonth> loader(String p, String m) =>
        (requests['$p/$m'] = Completer<ProviderCalendarMonth>()).future;
    await render(tester, loader);
    await tester.tap(find.byTooltip('Next month'));
    await tester.pumpAndSettle();
    expect(find.text('December 2026'), findsOneWidget);
    requests['provider-a/2026-11']!.complete(month('2026-11'));
    await tester.pumpAndSettle();
    expect(find.text('Loading availability…'), findsOneWidget);
    await render(tester, loader, provider: 'provider-b');
    requests['provider-a/2026-12']!.complete(month('2026-12'));
    await tester.pumpAndSettle();
    expect(find.text('Loading availability…'), findsOneWidget);
    requests['provider-b/2026-11']!.complete(month('2026-11'));
    await tester.pumpAndSettle();
    expect(find.text('Loading availability…'), findsNothing);
    expect(find.text('November 2026'), findsOneWidget);
  });

  testWidgets('small Android sheet and large text scroll without overflow', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              child: const Text('Open'),
              onPressed: () => showModalBottomSheet<DateTime>(
                context: context,
                isScrollControlled: true,
                constraints: const BoxConstraints(maxHeight: 500),
                builder: (_) => ProviderCalendar(
                  providerId: 'provider-a',
                  today: today,
                  loadMonth: (_, key) async => month(key),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.drag(
      find.byType(SingleChildScrollView),
      const Offset(0, -450),
    );
    await tester.pumpAndSettle();
    expect(find.text('Use selected date'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'valid date is returned as civil date; planning never claims available',
    (tester) async {
      DateTime? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                child: const Text('Open'),
                onPressed: () async {
                  result = await showModalBottomSheet<DateTime>(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => ProviderCalendar(
                      providerId: 'provider-a',
                      today: today,
                      loadMonth: (_, key) async => month(key),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('13'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Use selected date'));
      await tester.pumpAndSettle();
      expect(result, DateTime(2026, 11, 13));
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProviderCalendar(
              providerId: 'provider-a',
              today: today,
              planningOnly: true,
              selectedDate: result,
              loadMonth: (_, _) => throw StateError('must not call'),
            ),
          ),
        ),
      );
      expect(find.text('Fri, Nov 13: Availability unknown'), findsOneWidget);
      expect(find.textContaining('Planning date only'), findsOneWidget);
    },
  );
}
