import 'package:feasta/features/authentication/presentation/customer_consent_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('requires both explicit acceptances; decline never accepts', (
    tester,
  ) async {
    var accepts = 0;
    var declines = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerConsentScreen(
          onAccept: () async {
            accepts++;
          },
          onDecline: () async {
            declines++;
          },
          loader: (_) async => {
            'version': '2026-07-29',
            'sections': [
              {
                'title': 'Policy',
                'paragraphs': ['Current text'],
              },
            ],
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.tap(find.text('Cancel sign-in'));
    expect(declines, 1);
    expect(accepts, 0);
    await tester.tap(find.byType(CheckboxListTile).first);
    await tester.pump();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.tap(find.byType(CheckboxListTile).last);
    await tester.pump();
    await tester.tap(find.text('Accept and continue'));
    await tester.pumpAndSettle();
    expect(accepts, 1);
  });

  testWidgets('unavailable or incompatible policy disables acceptance', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerConsentScreen(
          onAccept: () async {
            fail('Must not provision');
          },
          onDecline: () async {},
          loader: (_) async => {'version': 'other', 'sections': []},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(FilledButton), findsNothing);
    expect(find.text('Cancel sign-in'), findsOneWidget);
  });
}
