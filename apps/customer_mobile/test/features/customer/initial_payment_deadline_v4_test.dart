import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:feasta/core/domain/legacy_booking_payment_authority.dart';
import 'package:feasta/features/customer/payment_required_screen.dart';
import 'package:feasta/shared/models/customer_payment_request.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/shared/models/initial_payment_deadline.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Offline Firestore snapshot test double; never accesses a Firebase service.
// ignore: subtype_of_sealed_class
class StoredDocument implements DocumentSnapshot<Map<String, dynamic>> {
  StoredDocument(this.values, {this.id = 'request_v4_test'});
  final Map<String, dynamic> values;
  @override
  final String id;
  @override
  Map<String, dynamic> data() => values;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

String signature(Map<String, dynamic> data) => jsonEncode(
  data,
  toEncodable: (value) =>
      value is Timestamp ? value.microsecondsSinceEpoch : value.toString(),
);

Timestamp stamp(String instant) => Timestamp.fromDate(DateTime.parse(instant));

Map<String, dynamic> stored({
  String accepted = '2026-11-01T09:00:00+08:00',
  String deadline = '2026-11-01T15:00:00+08:00',
}) => {
  'mainEventId': 'event_v4_test',
  'providerId': 'provider_v4_test',
  'status': 'waiting_for_down_payment',
  'paymentStatus': 'unpaid',
  'acceptedAt': stamp(accepted),
  'eventStartAt': stamp('2026-11-12T12:00:00+08:00'),
  'initialPaymentDeadlinePolicyVersion': 4,
  'initialPaymentDeadlineAt': stamp(deadline),
  'expiresAt': stamp(deadline),
  'financialSnapshot': {
    'schemaVersion': 1,
    'currency': 'PHP',
    'grossAmountInCentavos': 100000,
    'requiredUpfrontAmountInCentavos': 100000,
    'remainingBalanceInCentavos': 0,
  },
};

CustomerProviderPaymentRequest read(Map<String, dynamic> data) =>
    CustomerProviderPaymentRequest.fromDoc(
      StoredDocument(data),
      mainEventStatus: 'waiting_for_down_payment',
    );

void main() {
  for (final example in [
    (
      'standard six hours',
      '2026-11-01T09:00:00+08:00',
      '2026-11-01T15:00:00+08:00',
      '2026-11-01 15:00 PHT',
    ),
    (
      'rush two hours',
      '2026-11-01T13:00:00+08:00',
      '2026-11-01T15:00:00+08:00',
      '2026-11-01 15:00 PHT',
    ),
    (
      'overnight next day',
      '2026-11-01T20:00:00+08:00',
      '2026-11-02T10:00:00+08:00',
      '2026-11-02 10:00 PHT',
    ),
  ]) {
    testWidgets('displays frozen server deadline: ${example.$1}', (
      tester,
    ) async {
      final data = stored(accepted: example.$2, deadline: example.$3);
      if (example.$1 != 'standard six hours') {
        data['eventStartAt'] = stamp('2026-11-04T12:00:00+08:00');
      }
      final projection = read(data);
      expect(InitialPaymentDeadline.fromRecord(data).hasValidEvidence, isTrue);
      expect(
        projection.initialPaymentDeadline!.at,
        DateTime.parse(example.$3).toUtc(),
      );
      expect(projection.canStartCheckout, isTrue);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: InitialPaymentDeadlineNotice(
              deadline: projection.initialPaymentDeadline,
            ),
          ),
        ),
      );
      expect(find.text(example.$4), findsOneWidget);
      expect(find.text('Initial payment deadline'), findsOneWidget);
    });
  }

  test('historical 24-hour deadline is read unchanged, never recomputed', () {
    final data = stored(deadline: '2026-11-02T09:00:00+08:00')
      ..remove('initialPaymentDeadlinePolicyVersion')
      ..remove('initialPaymentDeadlineAt');
    final before = signature(data);
    expect(
      read(data).initialPaymentDeadline!.manilaLabel,
      '2026-11-02 09:00 PHT',
    );
    expect(read(data).canStartCheckout, isTrue);
    expect(signature(data), before);
  });

  test('restart and retries re-read exactly the stored instant', () {
    final data = stored();
    final before = signature(data);
    for (var restart = 0; restart < 3; restart++) {
      expect(
        read(Map.of(data)).initialPaymentDeadline!.at,
        data['expiresAt'].toDate().toUtc(),
      );
    }
    expect(signature(data), before);
  });

  test('projection never uses device clock for payment authority', () {
    // Even these already elapsed timestamps are only display evidence; server
    // checks the actual time when the customer requests checkout.
    final past = stored(
      accepted: '2000-01-01T09:00:00+08:00',
      deadline: '2000-01-01T15:00:00+08:00',
    );
    expect(
      read(past).initialPaymentDeadline!.manilaLabel,
      '2000-01-01 15:00 PHT',
    );
    expect(read(past).canStartCheckout, isTrue);
    final projectionSource = File(
      'lib/shared/models/initial_payment_deadline.dart',
    ).readAsStringSync();
    final optionsSource = File(
      'lib/shared/models/customer_payment_request.dart',
    ).readAsStringSync();
    expect(projectionSource, isNot(contains('DateTime.now')));
    expect(optionsSource, isNot(contains('DateTime.now')));
  });

  for (final patch in <Map<String, dynamic>>[
    {'initialPaymentDeadlineAt': null},
    {'initialPaymentDeadlineAt': '2026-11-01T15:00:00+08:00'},
    {'initialPaymentDeadlinePolicyVersion': 5},
    {'initialPaymentDeadlinePolicyVersion': '4'},
    {'acceptedAt': null},
    {'eventStartAt': null},
    {'expiresAt': null},
    {'expiresAt': stamp('2026-11-02T15:00:00+08:00')},
    {'hardPaymentDeadlineAt': 'bad'},
    {'hardPaymentDeadlineAt': stamp('2026-11-01T10:00:00+08:00')},
  ]) {
    test(
      'malformed evidence suppresses new checkout: ${patch.keys.join(',')} ${patch.values}',
      () {
        final data = {...stored(), ...patch};
        expect(read(data).canStartCheckout, isFalse);
        // Status and financial history can still be read.
        expect(read(data).status, 'waiting_for_down_payment');
        expect(read(data).providerId, 'provider_v4_test');
      },
    );
  }

  test(
    'legacy missing deadline is readable but never authorizes new checkout',
    () {
      final data = stored()
        ..remove('initialPaymentDeadlinePolicyVersion')
        ..remove('initialPaymentDeadlineAt')
        ..remove('expiresAt');
      expect(read(data).canStartCheckout, isFalse);
      expect(read(data).initialPaymentDeadline!.at, isNull);
    },
  );

  test('pending payment review still blocks actions', () {
    expect(
      read({
        ...stored(),
        'initialPaymentReview': {'schemaVersion': 1},
      }).canStartCheckout,
      isFalse,
    );
    expect(
      read({
        ...stored(),
        'lifecycleReconciliationRequired': true,
      }).canStartCheckout,
      isFalse,
    );
  });

  test('legacy recovery guard fails before any write on every attempt', () {
    for (var retry = 0; retry < 3; retry++) {
      expect(
        requireTrustedLegacyBookingPaymentAuthority,
        throwsA(
          isA<UnsupportedError>().having(
            (error) => error.message,
            'message',
            legacyBookingPaymentAuthorityMessage,
          ),
        ),
      );
    }
    final repository = File(
      'lib/features/authentication/data/repositories/feasta_repository.dart',
    ).readAsStringSync();
    for (final method in ['selectRecoveryOffer', 'acceptBooking']) {
      final start = repository.indexOf('Future<void> $method(');
      expect(start, greaterThanOrEqualTo(0));
      final end = repository.indexOf('\n  }\n', start);
      final body = repository.substring(start, end);
      expect(body, contains('requireTrustedLegacyBookingPaymentAuthority();'));
      expect(body, isNot(contains('_db')));
      expect(body, isNot(contains('_functions')));
    }
    expect(repository, isNot(contains('Duration(hours: 24)')));
    expect(repository, isNot(contains("'paymentDeadline': Timestamp")));
  });

  test(
    'legacy history and recovery information remain readable without migration',
    () {
      final historical = {
        'paymentDeadline': stamp('2026-11-02T09:00:00+08:00'),
        'status': 'confirmed',
        'selectedRecoveryOfferId': 'offer_historical',
      };
      final before = signature(historical);
      final booking = BookingModel.fromDoc(StoredDocument(historical));
      expect(
        booking.paymentDeadline,
        (historical['paymentDeadline'] as Timestamp).toDate(),
      );
      expect(booking.selectedRecoveryOfferId, 'offer_historical');
      expect(signature(historical), before);
      final offer = RecoveryOfferModel.fromDoc(
        StoredDocument({
          'offeringProviderBusinessName': 'Historical Caterer',
          'status': 'selected',
        }),
      );
      expect(offer.offeringProviderBusinessName, 'Historical Caterer');
      expect(offer.status, 'selected');
      final repository = File(
        'lib/features/authentication/data/repositories/feasta_repository.dart',
      ).readAsStringSync();
      for (final reader in [
        'recoveryOffersByBooking(',
        'bookingById(',
        'bookingTimelines(',
        'customerBookings(',
        'customerPaymentRequestById(',
      ]) {
        expect(repository, contains(reader));
      }
      final screen = File(
        'lib/features/customer/recovery_offers_screen.dart',
      ).readAsStringSync();
      expect(
        screen,
        contains('repository.recoveryOffersByBooking(booking.id)'),
      );
      expect(screen, contains('_showOfferDetails(context, offer)'));
      expect(screen, contains('legacyBookingPaymentAuthorityMessage'));
      expect(screen, isNot(contains('_selectOffer(')));
    },
  );

  test(
    'checkout payload cannot carry client deadline or eligibility overrides',
    () {
      final source = File(
        'lib/features/authentication/data/repositories/feasta_repository.dart',
      ).readAsStringSync();
      final start = source.indexOf('createProviderPaymentSession({');
      final call = source.indexOf('.call({', start);
      final end = source.indexOf('});', call);
      final payload = source.substring(call, end);
      expect(source.substring(start, call), contains("'createPaymentSession'"));
      for (final field in [
        'expiresAt',
        'initialPaymentDeadlineAt',
        'paymentDeadline',
        'acceptedAt',
        'eventStartAt',
        'amount',
        'eligible',
      ]) {
        expect(payload, isNot(contains("'$field'")));
      }
    },
  );
}
