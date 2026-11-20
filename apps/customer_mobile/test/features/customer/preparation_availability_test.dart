import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/widgets/preparation_availability.dart';

void main() {
  Widget screen(
    PreparationAvailabilityCheck check, {
    int guests = 50,
    bool valid = true,
    int day = 1,
  }) => MaterialApp(
    home: Scaffold(
      body: PreparationAvailability(
        packageId: 'package_test',
        providerId: 'provider_test',
        providerName: 'SB',
        date: DateTime(2099, 1, day),
        start: const TimeOfDay(hour: 12, minute: 0),
        end: valid ? const TimeOfDay(hour: 15, minute: 0) : null,
        guests: guests,
        check: check,
      ),
    ),
  );
  dynamic result(bool available) => {
    'results': [
      {
        'providerId': 'provider_test',
        'available': available,
        'reasonCode': available ? null : 'TIME_CONFLICT',
        'message': 'Backend result',
      },
    ],
  };
  testWidgets('automatic valid check, incomplete state and deduplication', (
    tester,
  ) async {
    var calls = 0;
    Future<dynamic> check(Map<String, dynamic> input) async {
      calls++;
      expect(input['eventTime'], '12:00');
      return result(true);
    }

    await tester.pumpWidget(screen(check, valid: false));
    await tester.pump(const Duration(seconds: 1));
    expect(calls, 0);
    await tester.pumpWidget(screen(check));
    expect(find.textContaining('Checking availability'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(calls, 1);
    expect(find.text('SB is available'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
    expect(find.text('Available for your selected event.'), findsOneWidget);
    expect(
      find.textContaining('Advisory only; capacity is not reserved.'),
      findsNothing,
    );
    await tester.pumpWidget(screen(check));
    await tester.pump(const Duration(seconds: 1));
    expect(calls, 1);
  });
  testWidgets('date and time changes immediately remove verified success', (
    tester,
  ) async {
    Future<dynamic> check(Map<String, dynamic> _) async => result(true);
    await tester.pumpWidget(screen(check));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(find.text('SB is available'), findsOneWidget);
    await tester.pumpWidget(screen(check, day: 2));
    expect(find.byIcon(Icons.check_circle), findsNothing);
    expect(find.textContaining('Checking availability'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(find.text('SB is available'), findsOneWidget);
    await tester.pumpWidget(screen(check, day: 2, valid: false));
    expect(find.byIcon(Icons.check_circle), findsNothing);
    expect(find.textContaining('Select a valid date'), findsOneWidget);
  });
  testWidgets('changed input invalidates result and ignores stale responses', (
    tester,
  ) async {
    final pending = <Completer<dynamic>>[];
    Future<dynamic> check(Map<String, dynamic> input) {
      final item = Completer<dynamic>();
      pending.add(item);
      return item.future;
    }

    await tester.pumpWidget(screen(check));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpWidget(screen(check, guests: 60));
    await tester.pump(const Duration(seconds: 1));
    expect(pending.length, 2);
    pending[1].complete(result(false));
    await tester.pump();
    pending[0].complete(result(true));
    await tester.pump();
    expect(find.textContaining('Unavailable:'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle), findsNothing);
  });
  testWidgets(
    'failure malformed response and disposal never show false availability',
    (tester) async {
      await tester.pumpWidget(screen((_) async => throw StateError('offline')));
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(
        find.textContaining('Availability could not be verified'),
        findsOneWidget,
      );
      await tester.pumpWidget(screen((_) async => {'results': []}, guests: 60));
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(
        find.textContaining('Availability could not be verified'),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.check_circle), findsNothing);
      final pending = Completer<dynamic>();
      await tester.pumpWidget(screen((_) => pending.future, guests: 70));
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpWidget(const SizedBox());
      pending.complete(result(true));
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );
}
