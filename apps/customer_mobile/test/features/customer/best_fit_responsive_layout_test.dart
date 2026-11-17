import 'package:feasta/features/customer/widgets/event_schedule_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final scale in [1.0, 1.3]) {
    testWidgets('schedule values fit at 360px, text scale $scale', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;

      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: const Size(360, 800),
              textScaler: TextScaler.linear(scale),
            ),
            child: Scaffold(
              body: SingleChildScrollView(
                child: EventScheduleCard(
                  eventDate: null,
                  startTime: null,
                  endTime: null,
                  onDateTap: () {},
                  onStartTap: () {},
                  onEndTap: () {},
                ),
              ),
            ),
          ),
        ),
      );

      expect(find.text('Start time'), findsOneWidget);
      expect(find.text('End time'), findsOneWidget);
      expect(find.text('Choose time'), findsNWidgets(2));

      final values = find.text('Choose time');
      for (final element in values.evaluate()) {
        final renderObject = element.renderObject;
        expect(renderObject, isA<RenderParagraph>());
        expect(
          (renderObject! as RenderParagraph).didExceedMaxLines,
          isFalse,
          reason: 'Choose time must not be truncated.',
        );
      }

      expect(tester.takeException(), isNull);
    });
  }
}
