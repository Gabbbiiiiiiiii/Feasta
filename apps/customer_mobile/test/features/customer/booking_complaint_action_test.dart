import 'dart:async';
import 'dart:io';

import 'package:feasta/features/customer/booking_complaint_action.dart';
import 'package:feasta/shared/models/booking_complaint.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const services = [
    BookingComplaintService(id: 'request_owned', name: 'Owned Provider'),
    BookingComplaintService(id: 'request_addon', name: 'Add-on Provider'),
  ];
  Future<void> open(
    WidgetTester tester,
    SubmitBookingComplaint submit, {
    Future<List<BookingComplaintService>> Function()? load,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BookingComplaintAction(
            loadServices: load ?? () async => services,
            submit: submit,
          ),
        ),
      ),
    );
    await tester.tap(find.text('Report an Issue'));
    await tester.pumpAndSettle();
  }

  Future<void> fill(WidgetTester tester) async {
    await tester.tap(find.byType(DropdownButtonFormField<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add-on Provider').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Service quality').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      '  The service did not match our agreement.  ',
    );
  }

  test('validates category and trimmed description boundaries', () {
    expect(
      validateBookingComplaint(null, 'A sufficiently long description.'),
      isNotNull,
    );
    expect(
      validateBookingComplaint(
        'unsupported',
        'A sufficiently long description.',
      ),
      isNotNull,
    );
    expect(validateBookingComplaint('other', '  short  '), isNotNull);
    expect(validateBookingComplaint('other', 'x' * 4001), isNotNull);
    expect(validateBookingComplaint('other', '  1234567890  '), isNull);
  });
  testWidgets('rejects missing fields without submitting', (tester) async {
    var count = 0;
    await open(tester, ({
      required providerRequestId,
      required category,
      required description,
    }) async {
      count++;
    });
    await tester.tap(find.text('Submit report'));
    await tester.pumpAndSettle();
    expect(find.text('Choose the affected service.'), findsOneWidget);
    expect(count, 0);
  });
  testWidgets(
    'selects affected service and prevents duplicates while loading, then shows success',
    (tester) async {
      final pending = Completer<void>();
      var count = 0;
      String? target;
      String? content;
      await open(tester, ({
        required providerRequestId,
        required category,
        required description,
      }) {
        count++;
        target = providerRequestId;
        content = description;
        return pending.future;
      });
      await fill(tester);
      await tester.tap(find.text('Submit report'));
      await tester.pump();
      expect(find.text('Submitting report'), findsOneWidget);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, 'Cancel'))
            .onPressed,
        isNull,
      );
      expect(count, 1);
      expect(target, 'request_addon');
      expect(content, 'The service did not match our agreement.');
      pending.complete();
      await tester.pumpAndSettle();
      expect(
        find.text('Issue reported. FEASTA Admin will review your report.'),
        findsOneWidget,
      );
      expect(find.byType(AlertDialog), findsNothing);
    },
  );
  testWidgets('keeps content on failure and supports retry', (tester) async {
    var count = 0;
    await open(tester, ({
      required providerRequestId,
      required category,
      required description,
    }) async {
      if (++count == 1) throw Exception('Please retry with the same details.');
    });
    await fill(tester);
    await tester.tap(find.text('Submit report'));
    await tester.pumpAndSettle();
    expect(find.text('Please retry with the same details.'), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text.trim(),
      'The service did not match our agreement.',
    );
    await tester.tap(find.text('Submit report'));
    await tester.pumpAndSettle();
    expect(count, 2);
    expect(find.byType(AlertDialog), findsNothing);
  });
  testWidgets('shows service-load error and supports reload', (tester) async {
    var count = 0;
    await open(
      tester,
      ({
        required providerRequestId,
        required category,
        required description,
      }) async {},
      load: () async {
        if (++count == 1) throw Exception('Services are unavailable.');
        return services;
      },
    );
    expect(find.text('Services are unavailable.'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.byType(DropdownButtonFormField<String>), findsNWidgets(2));
  });
  test(
    'repository sends only canonical target and content to createComplaint',
    () {
      final source = File(
        'lib/features/authentication/data/repositories/feasta_repository.dart',
      ).readAsStringSync();
      final start = source.indexOf('Future<void> submitBookingComplaint({');
      final block = source.substring(
        start,
        source.indexOf('Future<void> submitReview({', start),
      );
      expect(block, contains("httpsCallable('createComplaint')"));
      expect(block, contains("'providerRequestId': providerRequestId"));
      expect(block, contains("'description': description.trim()"));
      for (final field in [
        'customerId',
        'providerId',
        'bookingId',
        'status',
        'resolvedBy',
      ]) {
        expect(block, isNot(contains("'$field':")));
      }
    },
  );
}
