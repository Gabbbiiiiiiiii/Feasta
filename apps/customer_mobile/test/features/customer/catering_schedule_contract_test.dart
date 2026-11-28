import 'package:feasta/shared/models/booking_contract.dart';
import 'package:feasta/shared/models/catering_schedule.dart';
import 'package:feasta/shared/models/event_customization_data.dart';
import 'package:flutter_test/flutter_test.dart';

EventCustomizationData data({
  String? serviceTier = 'drop_off',
  String eventTime = '2:00 PM',
  String eventEndTime = '6:00 PM',
}) {
  return EventCustomizationData(
    serviceTier: serviceTier,
    eventType: 'wedding',
    eventDate: DateTime(2030, 6, 20),
    eventTime: eventTime,
    eventEndTime: eventEndTime,
    guestCount: 100,
    eventLocation: 'Ormoc City',
    eventAddress: '123 Test Street',
    selectedFoods: const [],
    selectedDecorations: const [],
    selectedFurniture: const [],
    selectedAddOns: const [],
    willArrangeOwnAddOns: false,
    customerArrangedAddOnsNote: '',
    specialRequest: '',
  );
}

void main() {
  test('drop_off payload keeps eventEndTime with the estimated drop-off', () {
    final payload = BookingSelection(
      providerId: 'provider_abcdefgh',
      packageId: 'package_abcdefgh',
      customization: data(),
    ).toJson(clientRequestId: 'client_request_1');

    expect(payload['eventTime'], '14:00');
    expect(payload['eventEndTime'], '18:00');
    expect(payload['serviceTier'], 'drop_off');
  });

  test('buffet_setup still requires end after start', () {
    expect(
      () => BookingSelection(
        providerId: 'provider_abcdefgh',
        packageId: 'package_abcdefgh',
        customization: data(
          serviceTier: 'buffet_setup',
          eventTime: '2:00 PM',
          eventEndTime: '2:00 PM',
        ),
      ).toJson(clientRequestId: 'client_request_1'),
      throwsFormatException,
    );

    final payload = BookingSelection(
      providerId: 'provider_abcdefgh',
      packageId: 'package_abcdefgh',
      customization: data(
        serviceTier: 'buffet_setup',
        eventTime: '2:00 PM',
        eventEndTime: '6:00 PM',
      ),
    ).toJson(clientRequestId: 'client_request_1');
    expect(payload['eventTime'], '14:00');
    expect(payload['eventEndTime'], '18:00');
  });

  test('schedule mode helpers', () {
    expect(cateringScheduleMode('drop_off'), CateringScheduleMode.dropOffTime);
    expect(
      usesDropOffTimeDisplay(
        serviceTier: 'drop_off',
        eventTime: '14:00',
        eventEndTime: '',
      ),
      isTrue,
    );
    expect(
      usesDropOffTimeDisplay(
        serviceTier: 'drop_off',
        eventTime: '14:00',
        eventEndTime: '18:00',
      ),
      isFalse,
    );
    expect(
      cateringScheduleFieldLabel(field: 'eventTime', serviceTier: 'drop_off'),
      'Estimated Drop-Off Time',
    );
    expect(
      cateringScheduleFieldLabel(
        field: 'eventEndTime',
        serviceTier: 'drop_off',
      ),
      'to',
    );
  });
}
