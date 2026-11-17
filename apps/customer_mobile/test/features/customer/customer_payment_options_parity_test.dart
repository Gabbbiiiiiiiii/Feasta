import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:crypto/crypto.dart';
import 'package:feasta/features/customer/payment_required_screen.dart';
import 'package:feasta/shared/models/customer_payment_request.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Offline snapshot; no Firebase initialization or emulator is required.
// ignore: subtype_of_sealed_class
class PaymentDocument implements DocumentSnapshot<Map<String, dynamic>> {
  PaymentDocument(this.values);
  final Map<String, dynamic> values;
  @override
  String get id => 'request_parity_23b18c';
  @override
  Map<String, dynamic> data() => values;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

final now = DateTime.utc(2026, 11, 15, 1);
Timestamp at(DateTime value) => Timestamp.fromDate(value);

Map<String, dynamic> stored() => {
  'status': 'waiting_for_down_payment',
  'paymentStatus': 'unpaid',
  'acceptedAt': at(now.subtract(const Duration(hours: 1))),
  'initialPaymentDeadlinePolicyVersion': 4,
  'initialPaymentDeadlineAt': at(now.add(const Duration(hours: 5))),
  'expiresAt': at(now.add(const Duration(hours: 5))),
  'eventStartAt': at(now.add(const Duration(days: 7))),
  'financialSnapshot': <String, dynamic>{
    'schemaVersion': 1,
    'currency': 'PHP',
    'grossAmountInCentavos': 100000,
    'requiredUpfrontAmountInCentavos': 30000,
    'remainingBalanceInCentavos': 70000,
  },
};

Map<String, dynamic> canonical({
  int version = 1,
  String reason = 'deposit_eligible',
}) => {
  ...stored(),
  'initialPaymentEligibilitySchemaVersion': version,
  'bookingPaymentPolicySnapshot': <String, dynamic>{},
  'initialPaymentEligibility': <String, dynamic>{
    'mode': reason == 'deposit_eligible' ? 'minimum_or_full' : 'full_only',
    'reason': reason,
    'depositEligible': reason == 'deposit_eligible',
    'depositAllowed': reason != 'deposit_disabled',
    if (reason != 'package_full_payment' || version == 2)
      'depositMinimumNoticeHours': 72,
    if (version == 2) ...{
      'authorityTimeSource': 'booking_submission',
      'submittedAt': at(now),
      'evaluatedAt': at(now),
    },
  },
};

CustomerProviderPaymentRequest read(
  Map<String, dynamic> values, {
  String eventStatus = 'waiting_for_down_payment',
  DateTime? clock,
}) => CustomerProviderPaymentRequest.fromDoc(
  PaymentDocument(values),
  mainEventStatus: eventStatus,
  now: clock ?? now,
);

List<String> choices(
  Map<String, dynamic> values, {
  String eventStatus = 'waiting_for_down_payment',
}) => read(
  values,
  eventStatus: eventStatus,
).checkoutOptions.map((o) => o.choice.apiValue).toList();

String paymentId(String choice) =>
    'payment_${sha256.convert(utf8.encode('provider-request:request_parity_23b18c:payment-choice:$choice:v1')).toString().substring(0, 32)}';

Map<String, dynamic> selected(Map<String, dynamic> values, String choice) => {
  ...values,
  'initialPaymentChoice': choice,
  'initialPaymentId': paymentId(choice),
  'paymentId': paymentId(choice),
  'settlementSchemaVersion': 1,
  'settlementStatus': 'initial_payment_processing',
  'grossSettledAmountInCentavos': 0,
  'outstandingAmountInCentavos': 100000,
};

Map<String, dynamic> settled() => {
  ...selected(stored(), 'minimum'),
  'status': 'confirmed',
  'paymentStatus': 'paid',
  'settlementStatus': 'deposit_settled',
  'grossSettledAmountInCentavos': 30000,
  'outstandingAmountInCentavos': 70000,
};

void main() {
  for (final version in [1, 2]) {
    for (final reason in [
      'package_full_payment',
      'deposit_disabled',
      'short_notice',
    ]) {
      test('V$version $reason with partial upfront offers full only', () {
        final options = read(
          canonical(version: version, reason: reason),
        ).checkoutOptions;
        expect(options.map((o) => o.choice), [CustomerPaymentChoice.full]);
        expect(options.single.amountInCentavos, 100000);
      });
    }
    test('V$version deposit eligible offers minimum then full', () {
      final options = read(canonical(version: version)).checkoutOptions;
      expect(options.map((o) => o.choice.apiValue), ['minimum', 'full']);
      expect(options.map((o) => o.amountInCentavos), [30000, 100000]);
    });
  }

  test('legacy requires all canonical evidence to be null or absent', () {
    expect(choices(stored()), ['minimum', 'full']);
    expect(
      choices({
        ...stored(),
        'initialPaymentEligibilitySchemaVersion': null,
        'initialPaymentEligibility': null,
        'bookingPaymentPolicySnapshot': null,
      }),
      ['minimum', 'full'],
    );
    for (final patch in [
      {'initialPaymentEligibilitySchemaVersion': 1},
      {'initialPaymentEligibility': <String, dynamic>{}},
      {'bookingPaymentPolicySnapshot': <String, dynamic>{}},
    ]) {
      expect(choices({...stored(), ...patch}), isEmpty);
    }
  });

  for (final patch in <Map<String, dynamic>>[
    {'mode': 'unknown'},
    {'depositEligible': null},
    {'depositEligible': false},
    {'depositAllowed': null},
    {'depositAllowed': false},
    {'reason': 'unknown'},
    {'reason': 'short_notice'},
    {'depositMinimumNoticeHours': null},
    {'depositMinimumNoticeHours': 0},
    {'depositMinimumNoticeHours': 8761},
    {'depositMinimumNoticeHours': 1.5},
    {'depositMinimumNoticeHours': '72'},
  ]) {
    test('invalid canonical eligibility fails closed: $patch', () {
      final values = canonical();
      (values['initialPaymentEligibility'] as Map).addAll(patch);
      expect(choices(values), isEmpty);
      expect(choices(selected(values, 'full')), isEmpty);
    });
  }
  test('malformed and missing canonical records fail closed', () {
    for (final value in [
      null,
      [],
      'invalid',
      7,
      {1: 'bad'},
    ]) {
      expect(
        choices({...canonical(), 'initialPaymentEligibility': value}),
        isEmpty,
      );
    }
    for (final version in [null, 0, 3, '1']) {
      expect(
        choices({
          ...canonical(),
          'initialPaymentEligibilitySchemaVersion': version,
        }),
        isEmpty,
      );
    }
  });
  for (final patch in <Map<String, dynamic>>[
    {'authorityTimeSource': null},
    {'authorityTimeSource': 'acceptance'},
    {'depositMinimumNoticeHours': 48},
    {'submittedAt': null},
    {'evaluatedAt': null},
  ]) {
    test('V2 requires submission evidence: $patch', () {
      final values = canonical(version: 2);
      (values['initialPaymentEligibility'] as Map).addAll(patch);
      expect(choices(values), isEmpty);
    });
  }

  test('selected initial choice is preserved and rechecks eligibility', () {
    expect(choices(selected(canonical(), 'minimum')), ['minimum']);
    expect(choices(selected(canonical(), 'full')), ['full']);
    expect(choices(selected(stored(), 'minimum')), ['minimum']);
    expect(
      choices(selected(canonical(reason: 'package_full_payment'), 'minimum')),
      isEmpty,
    );
    expect(
      choices(selected(canonical(reason: 'package_full_payment'), 'full')),
      ['full'],
    );
    for (final status in ['unpaid', 'pending', 'failed', 'expired']) {
      expect(
        choices({...selected(canonical(), 'minimum'), 'paymentStatus': status}),
        ['minimum'],
      );
    }
  });
  test(
    'payment IDs, pointers and settlement amounts are validated exactly',
    () {
      for (final patch in <Map<String, dynamic>>[
        {'initialPaymentId': 'arbitrary'},
        {'initialPaymentId': ' ${paymentId('minimum')}'},
        {'paymentId': 'arbitrary'},
        {'remainingBalancePaymentId': 'arbitrary'},
        {'settlementSchemaVersion': null},
        {'grossSettledAmountInCentavos': 1},
        {'outstandingAmountInCentavos': 99999},
        {'initialPaymentChoice': ' minimum'},
        {'settlementStatus': 'fully_settled'},
      ]) {
        expect(
          choices({...selected(canonical(), 'minimum'), ...patch}),
          isEmpty,
          reason: '$patch',
        );
      }
      for (final field in [
        'initialPaymentChoice',
        'initialPaymentId',
        'paymentId',
        'remainingBalancePaymentId',
      ]) {
        expect(choices({...stored(), field: ''}), isEmpty, reason: field);
        expect(choices({...stored(), field: 3}), isEmpty, reason: field);
      }
    },
  );

  test(
    'remaining balance preserves settled history without initial eligibility',
    () {
      final values = {
        ...settled(),
        'initialPaymentEligibilitySchemaVersion': 2,
      };
      for (final event in [
        'confirmed',
        'pending_provider_approval',
        'needs_provider_replacement',
        'waiting_for_down_payment',
      ]) {
        expect(choices(values, eventStatus: event), ['remaining_balance']);
      }
      expect(
        read(
          values,
          eventStatus: 'confirmed',
        ).checkoutOptions.single.amountInCentavos,
        70000,
      );
      for (final status in ['paid', 'partially_refunded', 'refunded']) {
        expect(
          choices({
            ...values,
            'paymentStatus': status,
          }, eventStatus: 'confirmed'),
          ['remaining_balance'],
        );
      }
      final balanceId = paymentId('remaining_balance');
      for (final status in ['unpaid', 'pending', 'failed', 'expired']) {
        expect(
          choices({
            ...values,
            'remainingBalancePaymentId': balanceId,
            'paymentId': balanceId,
            'paymentStatus': status,
          }, eventStatus: 'confirmed'),
          ['remaining_balance'],
        );
      }
      expect(
        choices({
          ...values,
          'remainingBalancePaymentId': 'bad',
        }, eventStatus: 'confirmed'),
        isEmpty,
      );
      expect(
        choices({
          ...values,
          'paymentStatus': 'processing',
        }, eventStatus: 'confirmed'),
        isEmpty,
      );
      expect(choices(values, eventStatus: 'cancelled'), isEmpty);
    },
  );

  test(
    'V2 balance enforcement blocks overdue, held and malformed evidence',
    () {
      final values = {
        ...settled(),
        'remainingBalanceTimingSchemaVersion': 2,
        'remainingBalanceDueAt': at(now.add(const Duration(hours: 1))),
      };
      expect(choices(values, eventStatus: 'confirmed'), ['remaining_balance']);
      for (final patch in <Map<String, dynamic>>[
        {'remainingBalanceDueAt': at(now)},
        {'remainingBalanceDueAt': null},
        {'remainingBalanceDueAt': 'bad'},
        {'remainingBalanceEnforcementSchemaVersion': 2},
        {'remainingBalanceEnforcementSchemaVersion': 1},
        {
          'remainingBalanceEnforcementSchemaVersion': 1,
          'remainingBalanceEnforcement': {'status': 'on_hold'},
        },
      ]) {
        expect(
          choices({...values, ...patch}, eventStatus: 'confirmed'),
          isEmpty,
        );
      }
    },
  );
  test('V3 balance permits grace period only before the hard deadline', () {
    final event = now.add(const Duration(hours: 30));
    final values = {
      ...settled(),
      'remainingBalanceTimingSchemaVersion': 3,
      'eventStartAt': at(event),
      'balanceDueHoursBeforeEvent': 48,
      'remainingBalanceDueAt': at(event.subtract(const Duration(hours: 48))),
      'hardPaymentDeadlineAt': at(event.subtract(const Duration(hours: 24))),
      'preparationStartsAt': at(event.subtract(const Duration(hours: 24))),
      'bookingLifecyclePolicySnapshot': {
        'schemaVersion': 3,
        'providerStartsManually': false,
        'requiresFullPayment': true,
        'autoStartAtScheduledTime': true,
        'providerConfirmsCompletion': true,
      },
    };
    expect(choices(values, eventStatus: 'confirmed'), ['remaining_balance']);
    expect(
      read(
        values,
        eventStatus: 'confirmed',
        clock: event.subtract(const Duration(hours: 24)),
      ).checkoutOptions,
      isEmpty,
    );
    for (final patch in <Map<String, dynamic>>[
      {'bookingLifecyclePolicySnapshot': null},
      {'preparationStartsAt': null},
      {'balanceDueHoursBeforeEvent': 24},
      {'remainingBalanceDueAt': at(now)},
      {
        'remainingBalanceEnforcement': {'status': 'on_hold'},
      },
      {
        'remainingBalanceEnforcement': {'status': 'reconciliation_required'},
      },
    ]) {
      expect(choices({...values, ...patch}, eventStatus: 'confirmed'), isEmpty);
    }
  });

  test('deadline, lifecycle, payment and refund restrictions fail closed', () {
    expect(
      read(stored(), clock: now.add(const Duration(hours: 5))).checkoutOptions,
      isEmpty,
    );
    expect(
      read(stored(), clock: now.add(const Duration(hours: 6))).checkoutOptions,
      isEmpty,
    );
    for (final patch in <Map<String, dynamic>>[
      {'status': 'expired'},
      {'status': 'cancelled'},
      {'paymentStatus': null},
      {'paymentStatus': 'processing'},
      {'paymentStatus': 'paid'},
      {'activeCancellationRequestId': 'cancel'},
      {'approvedCancellationRequestId': 'cancel'},
      {'refundExecutionLock': {}},
      {'initialPaymentReview': {}},
      {'lifecycleReconciliationRequired': true},
      {'reconciliationRequired': true},
      {'refundPolicySnapshot': {}},
      {'refundPolicyAgreement': {}},
      {
        'refundEligibilityState': {'schemaVersion': 1},
        'refundPolicySnapshot': {},
        'refundPolicyAgreement': {},
      },
      {
        'refundEligibilityState': {
          'schemaVersion': 1,
          'activeCancellationRequestId': 'cancel',
        },
        'refundPolicySnapshot': {},
        'refundPolicyAgreement': {},
      },
    ]) {
      expect(choices({...stored(), ...patch}), isEmpty, reason: '$patch');
    }
    for (final event in [
      'waiting_payment',
      'cancelled',
      'expired',
      'confirmed',
    ]) {
      expect(choices(stored(), eventStatus: event), isEmpty);
    }
    expect(
      choices({
        ...stored(),
        'refundEligibilityState': {
          'schemaVersion': 1,
          'activeCancellationRequestId': null,
        },
        'refundPolicySnapshot': {},
        'refundPolicyAgreement': {},
      }),
      ['minimum', 'full'],
    );
  });
  test(
    'invalid financial snapshots fail closed, zero/full upfront never offer deposit',
    () {
      for (final patch in <Map<String, dynamic>>[
        {'schemaVersion': 2},
        {'currency': 'USD'},
        {'grossAmountInCentavos': 0},
        {'grossAmountInCentavos': 9007199254740992},
        {'requiredUpfrontAmountInCentavos': -1},
        {'requiredUpfrontAmountInCentavos': 1.5},
        {'remainingBalanceInCentavos': null},
        {'remainingBalanceInCentavos': 1},
        {'grossAmountInCentavos': '100000'},
      ]) {
        final values = stored();
        (values['financialSnapshot'] as Map).addAll(patch);
        expect(choices(values), isEmpty, reason: '$patch');
      }
      for (final upfront in [0, 100000]) {
        final values = canonical();
        (values['financialSnapshot'] as Map).addAll(<String, dynamic>{
          'requiredUpfrontAmountInCentavos': upfront,
          'remainingBalanceInCentavos': 100000 - upfront,
        });
        expect(choices(values), ['full']);
        expect(choices(selected(values, 'minimum')), isEmpty);
      }
    },
  );

  test(
    'historical initial review allows balance while settlement locks block it',
    () {
      expect(
        choices({
          ...settled(),
          'initialPaymentReview': {},
        }, eventStatus: 'confirmed'),
        ['remaining_balance'],
      );
      for (final patch in <Map<String, dynamic>>[
        {'approvedCancellationRequestId': 'cancel'},
        {'refundExecutionLock': {}},
        {'reconciliationRequired': true},
        {'lifecycleReconciliationRequired': true},
        {'outstandingAmountInCentavos': 0, 'settlementStatus': 'fully_settled'},
      ]) {
        expect(
          choices({...settled(), ...patch}, eventStatus: 'confirmed'),
          isEmpty,
        );
      }
    },
  );

  for (final choice in CustomerPaymentChoice.values) {
    testWidgets(
      'button submits ${choice.apiValue} unchanged; rejection refreshes without fallback',
      (tester) async {
        tester.view.physicalSize = const Size(900, 1400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final booking = BookingModel.fromDoc(
          PaymentDocument({'bookingCode': 'PARITY'}),
        );
        final initial = choice == CustomerPaymentChoice.remainingBalance
            ? read(settled(), eventStatus: 'confirmed')
            : read(canonical());
        var loads = 0;
        final calls = <CustomerPaymentChoice>[];
        await tester.pumpWidget(
          MaterialApp(
            home: PaymentRequiredScreen(
              booking: booking,
              loadRequests: () async {
                loads++;
                return [
                  loads == 1
                      ? initial
                      : read(canonical(reason: 'package_full_payment')),
                ];
              },
              createSession:
                  ({required providerRequestId, required paymentChoice}) async {
                    expect(providerRequestId, initial.id);
                    calls.add(paymentChoice);
                    throw FirebaseFunctionsException(
                      code: 'failed-precondition',
                      message: 'RAW_FIREBASE_STACK_TRACE',
                    );
                  },
            ),
          ),
        );
        await tester.pumpAndSettle();
        final label = switch (choice) {
          CustomerPaymentChoice.minimum => 'Pay Minimum',
          CustomerPaymentChoice.full => 'Pay Full ·',
          CustomerPaymentChoice.remainingBalance => 'Pay Remaining Balance',
        };
        final button = find.textContaining(label);
        await tester.scrollUntilVisible(button, 250);
        await tester.tap(button);
        await tester.pumpAndSettle();
        expect(calls, [choice]);
        expect(loads, 2);
        expect(
          find.text(
            'Payment options have changed. Please review the refreshed options.',
          ),
          findsOneWidget,
        );
        expect(find.textContaining('RAW_FIREBASE'), findsNothing);
        expect(find.textContaining('Pay Minimum'), findsNothing);
        expect(find.textContaining('Pay Full Payment'), findsOneWidget);
      },
    );
  }
}
