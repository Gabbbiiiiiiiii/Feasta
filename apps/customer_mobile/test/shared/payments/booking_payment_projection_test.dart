import 'package:feasta/shared/payments/booking_payment_projection.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> deposit({
  Object? paymentStatus = 'unpaid',
  Object? settled = 250000,
  Object? outstanding = 250000,
  Object? settlementStatus = 'deposit_settled',
}) => {
  'paymentStatus': paymentStatus,
  'financialSnapshot': {'grossAmountInCentavos': 500000, 'schemaVersion': 1},
  'grossSettledAmountInCentavos': settled,
  'outstandingAmountInCentavos': outstanding,
  'settlementStatus': settlementStatus,
  'settlementSchemaVersion': 1,
};

void main() {
  group('projectBookingPayment', () {
    test('projects a deposit independently from stale legacy fields', () {
      expect(projectBookingPayment(deposit()), 'partially_paid');
    });

    test('projects zero settlement as unpaid', () {
      expect(
        projectBookingPayment(
          deposit(
            settled: 0,
            outstanding: 500000,
            settlementStatus: 'unpaid',
          ),
        ),
        'unpaid',
      );
    });

    test('projects full settlement as paid', () {
      expect(
        projectBookingPayment(
          deposit(
            settled: 500000,
            outstanding: 0,
            settlementStatus: 'fully_settled',
          ),
        ),
        'paid',
      );
    });

    test('rejects malformed accounting', () {
      expect(projectBookingPayment(deposit(settled: -1)), isNull);
      expect(projectBookingPayment(deposit(settled: 250000.5)), isNull);
    });
  });

  group('resolveCustomerProviderPaymentStatus', () {
    test('keeps refund statuses even when settlement exists', () {
      expect(
        resolveCustomerProviderPaymentStatus(deposit(paymentStatus: 'refunded')),
        'refunded',
      );
    });

    test('projects paid when settlement is fully settled despite unpaid field', () {
      expect(
        resolveCustomerProviderPaymentStatus(
          deposit(
            paymentStatus: 'unpaid',
            settled: 500000,
            outstanding: 0,
            settlementStatus: 'fully_settled',
          ),
        ),
        'paid',
      );
    });

    test('falls back to stored status when settlement is absent', () {
      expect(
        resolveCustomerProviderPaymentStatus({'paymentStatus': 'processing'}),
        'processing',
      );
    });
  });

  group('aggregateCustomerPaymentStatus', () {
    test('prefers provider request projection over stale booking status', () {
      expect(
        aggregateCustomerPaymentStatus(
          bookingPaymentStatus: 'unpaid',
          providerPaymentStatuses: const ['paid'],
        ),
        'paid',
      );
    });

    test('marks mixed settlement statuses as partially paid', () {
      expect(
        aggregateCustomerPaymentStatus(
          bookingPaymentStatus: 'unpaid',
          providerPaymentStatuses: const ['paid', 'unpaid'],
        ),
        'partially_paid',
      );
    });
  });
}
