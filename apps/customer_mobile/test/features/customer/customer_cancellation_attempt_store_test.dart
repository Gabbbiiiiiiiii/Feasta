import 'package:flutter_test/flutter_test.dart';

import 'package:feasta/features/customer/customer_cancellation_attempt_store.dart';

void main() {
  const attempt = CancellationAttempt(
    uid: 'customer_123',
    providerRequestId: 'provider_request_123',
    idempotencyKey: 'customer-cancellation:1234567890abcdef',
    reason: 'The event schedule has changed.',
  );

  test('valid cancellation attempt round-trips', () {
    final decoded = CancellationAttempt.decode(
      attempt.encode(),
      uid: attempt.uid,
      providerRequestId: attempt.providerRequestId,
    );

    expect(decoded.idempotencyKey, attempt.idempotencyKey);
    expect(decoded.reason, attempt.reason);
  });

  test('different customer cannot reuse saved attempt', () {
    expect(
      () => CancellationAttempt.decode(
        attempt.encode(),
        uid: 'customer_456',
        providerRequestId: attempt.providerRequestId,
      ),
      throwsFormatException,
    );
  });

  test('different provider request cannot reuse saved attempt', () {
    expect(
      () => CancellationAttempt.decode(
        attempt.encode(),
        uid: attempt.uid,
        providerRequestId: 'provider_request_456',
      ),
      throwsFormatException,
    );
  });

  test('rejects malformed attempt payload', () {
    expect(
      () => CancellationAttempt.decode(
        '{"version":1,"uid":"customer_123"}',
        uid: attempt.uid,
        providerRequestId: attempt.providerRequestId,
      ),
      throwsFormatException,
    );
  });

  test('rejects invalid idempotency key', () {
    const invalid = CancellationAttempt(
      uid: 'customer_123',
      providerRequestId: 'provider_request_123',
      idempotencyKey: 'wrong_key',
      reason: 'The event schedule has changed.',
    );

    expect(() => invalid.encode(), throwsFormatException);
  });

  test('rejects short cancellation reason', () {
    const invalid = CancellationAttempt(
      uid: 'customer_123',
      providerRequestId: 'provider_request_123',
      idempotencyKey: 'customer-cancellation:1234567890abcdef',
      reason: 'No',
    );

    expect(() => invalid.encode(), throwsFormatException);
  });

  test('rejects invalid provider request identity', () {
    expect(
      () => CancellationAttempt.validateIdentity(
        'customer_123',
        '../another_request',
      ),
      throwsFormatException,
    );
  });
}
