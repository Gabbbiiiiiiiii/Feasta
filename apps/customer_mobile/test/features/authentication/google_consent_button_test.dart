import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:feasta/features/authentication/application/google_policy_loader.dart';
import 'package:feasta/core/security/auth_operation_coordinator.dart';
import 'package:feasta/features/authentication/domain/google_consent.dart';
import 'package:feasta/features/presentation/screens/legal_document_screen.dart';
import 'package:feasta/features/presentation/widgets/google_consent_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> agreement(String version, String name) => {
  'version': version,
  'name': name,
  'sections': [
    {
      'title': 'Full agreement',
      'paragraphs': ['Complete published text'],
    },
  ],
};
Future<Map<String, dynamic>?> loader(FeastaLegalDocument document) async =>
    agreement(document.index == 0 ? 'terms-7' : 'privacy-19', document.name);
void main() {
  testWidgets('first load stays loading, reopen revalidates versions', (
    tester,
  ) async {
    var version = 'v1';
    var pending = Completer<Map<String, dynamic>?>();
    Future<Map<String, dynamic>?> read(FeastaLegalDocument document) =>
        pending.future;
    Widget view() => MaterialApp(
      home: Scaffold(
        body: GoogleConsentButton(loader: read, onPressed: (_) {}),
      ),
    );
    await tester.pumpWidget(view());
    expect(find.text('Loading Terms and Privacy Policy\u2026'), findsOneWidget);
    expect(
      find.textContaining('Current policies are unavailable'),
      findsNothing,
    );
    pending.complete(agreement(version, 'Published agreement'));
    await tester.pumpAndSettle();
    expect(find.text('Terms of Service'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    version = 'v2';
    pending = Completer<Map<String, dynamic>?>();
    await tester.pumpWidget(view());
    expect(find.text('Loading Terms and Privacy Policy\u2026'), findsOneWidget);
    expect(find.text('Terms of Service'), findsNothing);
    pending.complete(agreement(version, 'Published agreement'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Terms of Service'));
    await tester.pumpAndSettle();
    expect(find.text('Version v2'), findsOneWidget);
  });

  testWidgets('temporary policy failure retries then reveals disclosure', (
    tester,
  ) async {
    var reads = 0;
    Future<Map<String, dynamic>?> read(FeastaLegalDocument document) async {
      reads++;
      if (reads <= 2) {
        throw FirebaseFunctionsException(
          code: 'unavailable',
          message: 'DNS failure',
        );
      }
      return agreement('v1', document.name);
    }

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GoogleConsentButton(loader: read, onPressed: (_) {}),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Loading Terms and Privacy Policy\u2026'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(reads, 4);
    expect(find.text('Terms of Service'), findsOneWidget);
  });

  testWidgets(
    'exhausted policy retries fail closed and explicit retry recovers',
    (tester) async {
      var offline = true;
      var reads = 0;
      GoogleConsent? accepted;
      Future<Map<String, dynamic>?> read(FeastaLegalDocument document) async {
        reads++;
        if (offline) {
          throw FirebaseFunctionsException(
            code: 'unavailable',
            message: 'DNS failure',
          );
        }
        return agreement('v1', document.name);
      }

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GoogleConsentButton(
              loader: read,
              buttonKey: const Key('google'),
              onPressed: (value) => accepted = value,
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 650));
      await tester.pumpAndSettle();
      expect(reads, 6);
      expect(find.text('Retry Google policies'), findsOneWidget);
      await tester.tap(find.byKey(const Key('google')));
      expect(accepted, isNull);
      await tester.pump(const Duration(seconds: 3));
      expect(reads, 6);
      offline = false;
      await tester.tap(find.text('Retry Google policies'));
      await tester.pumpAndSettle();
      expect(find.text('Terms of Service'), findsOneWidget);
    },
  );

  test(
    'revalidated snapshots are reused, concurrent openings share reads',
    () async {
      final store = GooglePolicyLoader();
      var calls = 0;
      Future<Map<String, dynamic>?> read(FeastaLegalDocument document) async {
        calls++;
        return agreement('v1', document.name);
      }

      final values = await Future.wait([store.load(read), store.load(read)]);
      expect(calls, 2);
      expect(values[0], same(values[1]));
      expect(await store.load(read), same(values[0]));
      expect(calls, 4); // Reopening never trusts an old version without a read.
    },
  );

  test(
    'pending consent is one-shot and cannot cross identities or sessions',
    () async {
      final accepted = (await GoogleConsent.load(loader))!;
      void stage() {
        PendingGoogleConsent.uid = 'one';
        PendingGoogleConsent.epoch = AuthOperationCoordinator.shared.epoch;
        PendingGoogleConsent.consent = accepted;
      }

      stage();
      expect(PendingGoogleConsent.take('two'), isNull);
      expect(PendingGoogleConsent.take('one'), isNull);
      stage();
      AuthOperationCoordinator.shared.noteTransition();
      expect(PendingGoogleConsent.take('one'), isNull);
      stage();
      expect(PendingGoogleConsent.take('one'), same(accepted));
      expect(PendingGoogleConsent.take('one'), isNull);
    },
  );

  testWidgets(
    'visible disclosure captures exact documents; links open captured text',
    (tester) async {
      GoogleConsent? accepted;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GoogleConsentButton(
              loader: loader,
              buttonKey: const Key('google'),
              onPressed: (value) => accepted = value,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(find.text('Complete published text'), findsNothing);
      expect(
        find.textContaining("By continuing with Google", findRichText: true),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('google')));
      expect(accepted?.termsVersion, 'terms-7');
      expect(accepted?.privacyVersion, 'privacy-19');
      await tester.tap(find.text('Privacy Policy'));
      await tester.pumpAndSettle();
      expect(find.text('Version privacy-19'), findsOneWidget);
      expect(find.text('Complete published text'), findsOneWidget);
    },
  );
  testWidgets('tap before policies load captures no consent', (tester) async {
    final pending = Completer<Map<String, dynamic>?>();
    GoogleConsent? accepted;
    var tapped = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GoogleConsentButton(
            loader: (_) => pending.future,
            buttonKey: const Key('google'),
            onPressed: (value) {
              accepted = value;
              tapped = true;
            },
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('google')));
    expect(tapped, isTrue);
    expect(accepted, isNull);
    pending.complete(null);
    await tester.pumpAndSettle();
    expect(find.text('Retry Google policies'), findsOneWidget);
  });
  test('changed or unavailable agreements require a fresh action', () async {
    final accepted = (await GoogleConsent.load(loader))!;
    expect(await accepted.isCurrent(loader), isTrue);
    expect(
      await accepted.isCurrent(
        (document) async => agreement(
          document.index == 0 ? 'terms-8' : 'privacy-19',
          document.name,
        ),
      ),
      isFalse,
    );
    expect(await accepted.isCurrent((_) async => null), isFalse);
    expect(
      await accepted.isCurrent((_) async => throw StateError('offline')),
      isFalse,
    );
    expect(
      await accepted.isCurrent(
        (document) async => {
          ...agreement(
            document.index == 0 ? 'terms-7' : 'privacy-19',
            document.name,
          ),
          'sections': [
            {
              'title': 'Changed without version',
              'paragraphs': ['Different text'],
            },
          ],
        },
      ),
      isFalse,
    );
    final copy = accepted.documents;
    copy[0]['version'] = 'mutated';
    expect(accepted.termsVersion, 'terms-7');
  });
}
