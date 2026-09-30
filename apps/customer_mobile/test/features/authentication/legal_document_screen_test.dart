import 'package:feasta/features/presentation/screens/legal_document_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final document in FeastaLegalDocument.values) {
    testWidgets('$document displays published content and new versions', (
      tester,
    ) async {
      var version = '1.0';
      Future<Map<String, dynamic>?> load(FeastaLegalDocument requested) async {
        expect(requested, document);
        return {
          'name': 'Admin published name',
          'summary': 'Summary $version',
          'version': version,
          'effectiveDate': '2026-09-30',
          'sections': [
            {
              'title': 'Published section',
              'paragraphs': ['Admin body $version'],
            },
          ],
        };
      }

      await tester.pumpWidget(
        MaterialApp(
          home: LegalDocumentScreen(document: document, loader: load),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Admin published name'), findsOneWidget);
      expect(find.text('Version 1.0'), findsOneWidget);
      expect(find.text('Summary 1.0'), findsOneWidget);
      expect(find.text('Effective date: 2026-09-30'), findsOneWidget);
      expect(find.text('Admin body 1.0'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      version = '1.1';
      await tester.pumpWidget(
        MaterialApp(
          home: LegalDocumentScreen(document: document, loader: load),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Version 1.1'), findsOneWidget);
      expect(find.text('Summary 1.1'), findsOneWidget);
      expect(find.text('Summary 1.0'), findsNothing);
      expect(find.text('Admin body 1.1'), findsOneWidget);
      expect(find.text('Admin body 1.0'), findsNothing);
    });
    for (final failure in ['missing', 'offline', 'malformed']) {
      testWidgets('$document $failure shows unavailable', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: LegalDocumentScreen(
              document: document,
              loader: (_) async {
                if (failure == 'offline') throw Exception('offline');
                return failure == 'missing' ? null : {'sections': 'invalid'};
              },
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.text(
            document == FeastaLegalDocument.termsOfService
                ? 'Terms of Service are currently unavailable.'
                : 'Privacy Policy is currently unavailable.',
          ),
          findsOneWidget,
        );
      });
    }
  }
}
