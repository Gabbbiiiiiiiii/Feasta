import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/marketplace_availability.dart';

void main() {
  MarketplaceEventContext event({
    String date = '2027-02-15',
    String start = '09:00',
    String end = '17:00',
    int guests = 100,
  }) => MarketplaceEventContext(
    eventDate: date,
    eventTime: start,
    eventEndTime: end,
    guestCount: guests,
  );
  final now = DateTime.utc(2027, 2, 14, 16);
  test(
    'uses Philippine date and requires canonical date and same-day time range',
    () {
      expect(event().validate(now), isNull);
      expect(event(date: '2027-02-14').validate(now), isNotNull);
      expect(event(date: '2027-02-30').validate(now), isNotNull);
      expect(event(start: '17:00', end: '09:00').validate(now), isNotNull);
      expect(event(start: '09:00', end: '09:00').validate(now), isNotNull);
      expect(event(guests: 0).validate(now), isNotNull);
      expect(event(guests: 10001).validate(now), isNotNull);
      expect(event().toJson()['serviceType'], 'all');
    },
  );
  Map<String, dynamic> result(
    String id, {
    bool available = true,
    String? reason,
  }) => {
    'providerId': id,
    'available': available,
    'message': 'Checked',
    'reasonCode': reason,
  };
  test('parses only complete backend results for requested providers', () {
    final rows = [
      result('provider1'),
      result('provider2', available: false, reason: 'TIME_CONFLICT'),
    ];
    expect(
      parseMarketplaceAvailability(
        {'results': rows},
        ['provider1', 'provider2'],
      ).last.available,
      false,
    );
    for (final invalid in [
      {
        'results': [result('provider1')],
      },
      {
        'results': [result('provider1'), result('provider1')],
      },
      {
        'results': [result('provider1'), result('unexpected')],
      },
      {
        'results': [
          result('provider1'),
          result('provider2', reason: 'TIME_CONFLICT'),
        ],
      },
      {
        'results': [result('provider1'), result('provider2', available: false)],
      },
      {
        'results': [
          result('provider1'),
          {...result('provider2'), 'available': 'true'},
        ],
      },
    ]) {
      expect(
        () => parseMarketplaceAvailability(invalid, ['provider1', 'provider2']),
        throwsFormatException,
      );
    }
  });
}
