import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:feasta/shared/models/customer_payment_request.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter_test/flutter_test.dart';

// ignore: subtype_of_sealed_class
class _FakeRequestDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeRequestDoc(this._data);
  final Map<String, dynamic> _data;
  @override
  String get id => 'req_payment_options_1';
  @override
  Map<String, dynamic> data() => _data;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('CustomerArrangedPayment', () {
    test('parses valid offered and accepted records', () {
      final initialDue = DateTime.utc(2027, 5, 10, 9);
      final balanceDue = DateTime.utc(2027, 5, 14, 10);
      final parsed = CustomerArrangedPayment.fromRecord({
        'schemaVersion': 1,
        'id': '11111111-1111-4111-8111-111111111111',
        'status': 'offered',
        'grossInCentavos': 3000000,
        'upfrontInCentavos': 500000,
        'initialDueAt': Timestamp.fromDate(initialDue),
        'balanceDueAt': Timestamp.fromDate(balanceDue),
      });

      expect(parsed, isNotNull);
      expect(parsed!.upfront, 500000);
      expect(parsed.balance, 2500000);
      expect(parsed.status, 'offered');
    });

    test('rejects declined, withdrawn, inverted dates, or sub-peso splits', () {
      final initialDue = DateTime.utc(2027, 5, 10, 9);
      final balanceDue = DateTime.utc(2027, 5, 14, 10);
      expect(
        CustomerArrangedPayment.fromRecord({
          'schemaVersion': 1,
          'id': 'offer-1',
          'status': 'declined',
          'grossInCentavos': 3000000,
          'upfrontInCentavos': 500000,
          'initialDueAt': Timestamp.fromDate(initialDue),
          'balanceDueAt': Timestamp.fromDate(balanceDue),
        }),
        isNull,
      );
      expect(
        CustomerArrangedPayment.fromRecord({
          'schemaVersion': 1,
          'id': 'offer-2',
          'status': 'accepted',
          'grossInCentavos': 3000000,
          'upfrontInCentavos': 50,
          'initialDueAt': Timestamp.fromDate(initialDue),
          'balanceDueAt': Timestamp.fromDate(balanceDue),
        }),
        isNull,
      );
      expect(
        CustomerArrangedPayment.fromRecord({
          'schemaVersion': 1,
          'id': 'offer-3',
          'status': 'accepted',
          'grossInCentavos': 3000000,
          'upfrontInCentavos': 500000,
          'initialDueAt': Timestamp.fromDate(balanceDue),
          'balanceDueAt': Timestamp.fromDate(initialDue),
        }),
        isNull,
      );
    });
  });

  group('Multi-select package payment options (fullPaymentAllowed & minimum_only)', () {
    test('PackageModel parses fullPaymentAllowed for deposit packages only', () {
      final downOnly = PackageModel.fromMap('pkg_down', {
        'name': 'Fiesta',
        'price': 10000,
        'paymentPolicy': 'deposit_then_balance',
        'fullPaymentAllowed': false,
        'depositPercentage': 30,
      });
      expect(downOnly.paymentPolicy, 'deposit_then_balance');
      expect(downOnly.fullPaymentAllowed, isFalse);

      final both = PackageModel.fromMap('pkg_both', {
        'name': 'Fiesta',
        'price': 10000,
        'paymentPolicy': 'deposit_then_balance',
        'fullPaymentAllowed': true,
        'depositPercentage': 30,
      });
      expect(both.fullPaymentAllowed, isTrue);

      final fullOnly = PackageModel.fromMap('pkg_full', {
        'name': 'Fiesta',
        'price': 10000,
        'paymentPolicy': 'full_payment',
        'fullPaymentAllowed': false,
        'depositPercentage': 100,
      });
      expect(fullOnly.paymentPolicy, 'full_payment');
      expect(fullOnly.fullPaymentAllowed, isNull);

      final customOccasion = PackageModel.fromMap('pkg_fiesta', {
        'sharedContractVersion': 2,
        'name': 'Fiesta Lechon Buffet',
        'price': 25000,
        'eventType': 'other',
        'occasionScope': 'specific',
        'occasionMatchIds': ['birthday', 'other'],
        'customOccasionLabels': ['Barangay Fiesta'],
      });
      expect(customOccasion.customOccasionLabels, ['Barangay Fiesta']);
      expect(customOccasion.occasionDisplayLabel, 'birthday, Barangay Fiesta');
    });

    test('CustomerProviderPaymentRequest exposes only minimum choice on minimum_only mode', () {
      final now = DateTime.utc(2027, 6, 11, 4);
      final submittedAt = DateTime.utc(2027, 6, 10, 2);
      final deadlineAt = DateTime.utc(2027, 6, 12, 2);
      final eventStartAt = DateTime.utc(2027, 6, 20, 10);

      final request = CustomerProviderPaymentRequest.fromDoc(
        _FakeRequestDoc({
          'status': 'waiting_for_down_payment',
          'paymentStatus': 'unpaid',
          'acceptedAt': Timestamp.fromDate(now.subtract(const Duration(hours: 1))),
          'initialPaymentDeadlinePolicyVersion': 4,
          'initialPaymentDeadlineAt': Timestamp.fromDate(deadlineAt),
          'expiresAt': Timestamp.fromDate(deadlineAt),
          'eventStartAt': Timestamp.fromDate(eventStartAt),
          'initialPaymentEligibilitySchemaVersion': 2,
          'bookingPaymentPolicySnapshot': <String, dynamic>{},
          'initialPaymentEligibility': <String, dynamic>{
            'authorityTimeSource': 'booking_submission',
            'submittedAt': Timestamp.fromDate(submittedAt),
            'evaluatedAt': Timestamp.fromDate(submittedAt),
            'eventStartAt': Timestamp.fromDate(eventStartAt),
            'depositAllowed': true,
            'depositMinimumNoticeHours': 72,
            'depositEligible': true,
            'mode': 'minimum_only',
            'reason': 'deposit_eligible',
          },
          'financialSnapshot': <String, dynamic>{
            'schemaVersion': 1,
            'currency': 'PHP',
            'grossAmountInCentavos': 3000000,
            'requiredUpfrontAmountInCentavos': 900000,
            'remainingBalanceInCentavos': 2100000,
          },
        }),
        mainEventStatus: 'waiting_for_down_payment',
        now: now,
      );

      expect(
        request.checkoutOptions.map((o) => o.choice).toList(),
        [CustomerPaymentChoice.minimum],
      );
      expect(request.checkoutOptions.single.amountInCentavos, 900000);
    });
  });
}
