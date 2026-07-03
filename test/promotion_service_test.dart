import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/services/promotion_service.dart';

void main() {
  group('PromotionService validation', () {
    test('accepts a valid promotion payload', () {
      final errors = PromotionService.validatePromotionPayload(
        title: 'Summer Sale',
        description: 'Limited time offer for summer bookings.',
        imageUrl: 'https://example.com/banner.jpg',
      );

      expect(errors, isEmpty);
    });

    test('rejects an empty title and missing image', () {
      final errors = PromotionService.validatePromotionPayload();

      expect(errors, contains('Title is required.'));
      expect(
        errors,
        contains('At least one of imageUrl or imageBytes must be provided.'),
      );
    });
  });
}
