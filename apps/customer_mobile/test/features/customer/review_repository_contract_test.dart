import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/authentication/data/repositories/feasta_repository.dart',
  ).readAsStringSync();

  test('review submission sends only the canonical target and content', () {
    final start = source.indexOf('Future<void> submitReview({');
    final end = source.indexOf('Future<void> deleteReview({', start);
    final block = source.substring(start, end);

    expect(block, contains("'providerRequestId': providerRequestId"));
    expect(block, contains("'rating': rating"));
    expect(block, contains("'comment': comment.trim()"));
    expect(block, isNot(contains("'bookingId'")));
    expect(block, isNot(contains("'providerId'")));
    expect(block, isNot(contains("'customerId'")));
  });

  test('review deletion uses the aggregate-safe callable', () {
    expect(source, contains("httpsCallable('deleteReview')"));
    expect(source, contains('_providerRequestIdForReview'));
    expect(
      source,
      contains('This booking does not have a reviewable provider request.'),
    );
  });
}
