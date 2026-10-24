import 'package:feasta/features/authentication/presentation/customer_consent_screen.dart';
import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:feasta/features/presentation/screens/legal_document_screen.dart';
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
          onAccept: (termsVersion, privacyVersion) async {
            accepts++;
          },
          onDecline: () async {
            declines++;
          },
          loader: (_) async => {
            'name': 'Policy',
            'version': '1.1',
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
    await tapVisible(tester, find.text('Cancel sign-in'));
    expect(declines, 1);
    expect(accepts, 0);
    await tapVisible(tester, find.byType(CheckboxListTile).first);
    await tester.pump();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tapVisible(tester, find.byType(CheckboxListTile).last);
    await tester.pump();
    await tapVisible(tester, find.text('Agree and continue'));
    await tester.pumpAndSettle();
    expect(accepts, 1);
  });

  testWidgets('unavailable or incompatible policy disables acceptance', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerConsentScreen(
          onAccept: (termsVersion, privacyVersion) async {
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
  for (final versions in [
    ['1.1', '1.1'],
    ['1.2', '1.2'],
    ['1.2', 'privacy-3'],
  ]) {
    testWidgets('submits exact displayed versions $versions', (tester) async {
      List<String>? submitted;
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerConsentScreen(
            loader: (document) async => agreement(
              versions[document == FeastaLegalDocument.termsOfService ? 0 : 1],
            ),
            onAccept: (terms, privacy) async {
              submitted = [terms, privacy];
            },
            onDecline: () async {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
      expect(
        tester
            .widgetList<CheckboxListTile>(find.byType(CheckboxListTile))
            .every((tile) => tile.value == false),
        isTrue,
      );
      await tapVisible(tester, find.byType(CheckboxListTile).first);
      await tester.pump();
      await tapVisible(tester, find.byType(CheckboxListTile).last);
      await tester.pump();
      await tapVisible(tester, find.text('Agree and continue'));
      await tester.pumpAndSettle();
      expect(submitted, versions);
    });
  }
  final malformed = <Map<String, dynamic>?>[
    null,
    {...agreement('1.1'), 'version': ''},
    {...agreement('1.1'), 'version': 1.1},
    {...agreement('1.1'), 'name': ' '},
    {...agreement('1.1'), 'sections': []},
    {
      ...agreement('1.1'),
      'sections': [
        {
          'title': '',
          'paragraphs': ['text'],
        },
      ],
    },
    {
      ...agreement('1.1'),
      'sections': [
        {'title': 'title', 'paragraphs': []},
      ],
    },
    {
      ...agreement('1.1'),
      'sections': [
        {
          'title': 'title',
          'paragraphs': [' '],
        },
      ],
    },
    {
      ...agreement('1.1'),
      'sections': [
        {
          'title': 'title',
          'paragraphs': [42],
        },
      ],
    },
  ];
  for (var index = 0; index < malformed.length; index++) {
    for (final invalidDocument in FeastaLegalDocument.values) {
      testWidgets('invalid $invalidDocument case $index blocks consent', (
        tester,
      ) async {
        await tester.pumpWidget(
          MaterialApp(
            home: CustomerConsentScreen(
              loader: (document) async => document == invalidDocument
                  ? malformed[index]
                  : agreement('1.1'),
              onAccept: (_, _) async => fail('Must not provision'),
              onDecline: () async {},
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byType(CheckboxListTile), findsNothing);
        expect(find.byType(FilledButton), findsNothing);
        expect(find.text('Retry policies'), findsOneWidget);
      });
    }
  }
  for (final code in ['unavailable', 'permission-denied', 'unauthenticated']) {
    testWidgets('$code loading failure allows safe retry', (tester) async {
      var failLoad = true;
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerConsentScreen(
            loader: (_) async {
              if (failLoad) {
                throw FirebaseFunctionsException(
                  code: code,
                  message: 'Mock failure',
                );
              }
              return agreement('1.2');
            },
            onAccept: (_, _) async => fail('Must not provision'),
            onDecline: () async {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(CheckboxListTile), findsNothing);
      if (code != 'unavailable') {
        expect(find.textContaining('authorized'), findsOneWidget);
      }
      failLoad = false;
      await tapVisible(tester, find.text('Retry policies'));
      await tester.pumpAndSettle();
      expect(find.byType(CheckboxListTile), findsNWidgets(2));
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
    });
  }
  testWidgets('replacement during loading ignores previous agreements', (
    tester,
  ) async {
    final pending = Completer<Map<String, dynamic>?>();
    Widget screen(Key key, LegalDocumentLoader loader) => MaterialApp(
      home: CustomerConsentScreen(
        key: key,
        loader: loader,
        onAccept: (_, _) async => fail('Must not provision'),
        onDecline: () async {},
      ),
    );
    await tester.pumpWidget(
      screen(const ValueKey('old-identity'), (_) => pending.future),
    );
    await tester.pumpWidget(
      screen(const ValueKey('new-identity'), (_) async => agreement('1.2')),
    );
    await tester.pumpAndSettle();
    pending.complete(agreement('old-version'));
    await tester.pumpAndSettle();
    expect(find.text('Version old-version'), findsNothing);
    expect(find.text('Version 1.2'), findsNWidgets(2));
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
  });
  testWidgets('cancellation during loading never accepts late completion', (
    tester,
  ) async {
    final pending = Completer<Map<String, dynamic>?>();
    var declined = false;
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerConsentScreen(
          loader: (_) => pending.future,
          onAccept: (_, _) async => fail('Must not provision'),
          onDecline: () async {
            declined = true;
          },
        ),
      ),
    );
    await tester.pump();
    await tapVisible(tester, find.text('Cancel sign-in'));
    expect(declined, isTrue);
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    pending.complete(agreement('1.1'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}

Map<String, dynamic> agreement(String version) => {
  'name': 'Published policy',
  'version': version,
  'sections': [
    {
      'title': 'Section',
      'paragraphs': ['Policy text'],
    },
  ],
};

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
}
