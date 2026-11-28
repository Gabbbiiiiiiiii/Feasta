import 'package:feasta/features/customer/best_fit_venue_guard.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final placeholder = CustomerAddressModel.defaultOrmoc;

  test('unselected Ormoc placeholder is not a confirmed venue', () {
    expect(placeholder.hasCoordinates, isTrue);
    expect(isConfirmedBestFitVenue(placeholder), isFalse);
  });

  test('location picker confirmation accepts the selected default pin', () {
    final confirmed = placeholder.copyWith(
      createdAt: DateTime.utc(2026, 11, 18),
    );

    expect(isConfirmedBestFitVenue(confirmed), isTrue);
  });

  test('saved valid non-placeholder address remains accepted', () {
    final saved = placeholder.copyWith(
      id: 'saved_venue_123',
      fullAddress: 'Selected venue, Ormoc City, Leyte',
    );

    expect(isConfirmedBestFitVenue(saved), isTrue);
  });

  test('invalid coordinates cannot count as confirmation', () {
    final invalid = placeholder.copyWith(
      id: 'saved_invalid',
      latitude: 0,
      longitude: 0,
    );

    expect(isConfirmedBestFitVenue(invalid), isFalse);
  });

  test('empty written address cannot count as confirmation', () {
    final invalid = placeholder.copyWith(
      id: 'saved_without_address',
      fullAddress: '',
    );

    expect(isConfirmedBestFitVenue(invalid), isFalse);
  });
}
