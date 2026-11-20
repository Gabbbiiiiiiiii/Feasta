import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/customer_payment_request.dart';

void main() {
  Map<String, dynamic> request({
    String mode = 'full_only',
    String reason = 'short_notice',
    int version = 2,
    int hours = 72,
    bool depositAllowed = true,
  }) => {
    'initialPaymentEligibilitySchemaVersion': version,
    'initialPaymentEligibility': {
      'mode': mode,
      'reason': reason,
      'depositEligible': mode == 'minimum_or_full',
      'depositAllowed': depositAllowed,
      'depositMinimumNoticeHours': hours,
      'authorityTimeSource': 'booking_submission',
      'submittedAt': DateTime.utc(2026, 11, 18),
      'evaluatedAt': DateTime.utc(2026, 11, 18),
    },
  };

  test('new full-only short notice uses submission time wording', () {
    expect(
      customerInitialPaymentExplanation(request()),
      'Full payment is required because the booking was submitted fewer than 3 days before the event.',
    );
  });

  test('deposit eligible does not display full-only explanation', () {
    expect(
      customerInitialPaymentExplanation(
        request(mode: 'minimum_or_full', reason: 'deposit_eligible'),
      ),
      isNull,
    );
  });

  test('saved disabled-deposit policy has its own explanation', () {
    expect(
      customerInitialPaymentExplanation(
        request(reason: 'deposit_disabled', depositAllowed: false),
      ),
      'Full payment is required under the saved booking payment policy.',
    );
  });

  test('mismatched version and 72-hour proof is not trusted', () {
    expect(customerInitialPaymentExplanation(request(hours: 48)), isNull);
    final invalid = request();
    final eligibility = Map<String, dynamic>.from(
      invalid['initialPaymentEligibility'] as Map,
    );
    eligibility['submittedAt'] = null;
    invalid['initialPaymentEligibility'] = eligibility;
    expect(customerInitialPaymentExplanation(invalid), isNull);
  });

  test('legacy acceptance-time eligibility retains historical explanation', () {
    expect(
      customerInitialPaymentExplanation(request(version: 1, hours: 48)),
      'Full payment is required because fewer than 2 days remained before the event when this booking was accepted.',
    );
  });

  test('unknown eligibility does not manufacture an explanation', () {
    expect(customerInitialPaymentExplanation({}), isNull);
  });
}
