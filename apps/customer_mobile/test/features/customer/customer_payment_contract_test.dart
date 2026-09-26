import 'dart:io';

import 'package:feasta/core/constants/status_constants.dart';
import 'package:feasta/shared/models/customer_payment_request.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('P6 customer payment contract', () {
    test('customer payment choices match the trusted callable contract', () {
      expect(CustomerPaymentChoice.minimum.apiValue, 'minimum');
      expect(CustomerPaymentChoice.full.apiValue, 'full');
      expect(
        CustomerPaymentChoice.remainingBalance.apiValue,
        'remaining_balance',
      );
    });

    test(
      'booking payment status supports legacy and canonical waiting states',
      () {
        expect(
          BookingStatus.isWaitingForPayment(BookingStatus.waitingPayment),
          isTrue,
        );

        expect(
          BookingStatus.isWaitingForPayment(
            BookingStatus.waitingForDownPayment,
          ),
          isTrue,
        );

        expect(
          BookingStatus.isWaitingForPayment(BookingStatus.confirmed),
          isFalse,
        );
      },
    );

    test(
      'mobile checkout sends identity and choice but not authoritative money',
      () {
        final source = File(
          'lib/features/authentication/data/repositories/'
          'feasta_repository.dart',
        ).readAsStringSync();

        expect(source, contains('createProviderPaymentSession({'));

        expect(
          source,
          isNot(
            contains(
              'Future<({String paymentId, String checkoutUrl})> '
              'createPaymentSession({',
            ),
          ),
        );

        final methodStart = source.indexOf('createProviderPaymentSession({');

        expect(methodStart, greaterThanOrEqualTo(0));

        final methodTail = source.substring(methodStart);

        final callStart = methodTail.indexOf('.call({');
        expect(callStart, greaterThanOrEqualTo(0));

        final callEnd = methodTail.indexOf('});', callStart);
        expect(callEnd, greaterThan(callStart));

        final callablePayload = methodTail.substring(callStart, callEnd);

        expect(callablePayload, contains("'providerRequestId'"));

        expect(callablePayload, contains("'paymentChoice'"));

        expect(callablePayload, contains("'idempotencyKey'"));

        expect(callablePayload, isNot(contains("'bookingId'")));

        expect(callablePayload, isNot(contains("'amount'")));

        expect(callablePayload, isNot(contains("'amountInCentavos'")));
      },
    );

    test(
      'payment status uses provider settlement rather than booking confirmation',
      () {
        final source = File(
          'lib/features/customer/payment_status_screen.dart',
        ).readAsStringSync();

        expect(source, contains('customerPaymentRequestById'));

        expect(source, contains("'deposit_settled'"));

        expect(source, contains("'balance_payment_processing'"));

        expect(source, contains("'fully_settled'"));

        expect(
          source,
          isNot(contains('booking.status == BookingStatus.confirmed')),
        );
      },
    );

    test('checkout UI exposes all trusted P6 customer payment choices', () {
      final source = File(
        'lib/features/customer/payment_required_screen.dart',
      ).readAsStringSync();

      expect(source, contains("'Pay Minimum'"));

      expect(source, contains("'Pay Full'"));

      expect(source, contains("'Pay Remaining Balance'"));

      expect(source, contains('PaymentStatusScreen('));

      expect(source, contains('providerRequestId: request.id'));

      expect(source, contains('paymentChoice: option.choice'));

      expect(source, contains('amountInCentavos: option.amountInCentavos'));
    });
  });
}
