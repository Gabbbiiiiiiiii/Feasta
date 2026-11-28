import 'package:feasta/shared/models/booking_contract.dart';
import 'package:feasta/shared/models/booking_agreement.dart';
import 'package:feasta/shared/models/event_customization_data.dart';

Map<String, dynamic> agreementFixture({
  String provider = 'provider_123',
  String keyCharacter = 'a',
  bool deposit = true,
}) => {
  'schemaVersion': 1,
  'timingSchemaVersion': 3,
  'agreementKey': keyCharacter * 64,
  'providerId': provider,
  'providerName': provider == 'provider_123'
      ? 'Ana Catering'
      : 'Music Provider',
  'serviceNames': ['Celebration service'],
  'serviceTierLabel': deposit ? 'Full-Service Catering' : null,
  'eventStartAt': '2030-01-05T06:00:00.000Z',
  'depositEligibilityCutoffAt': '2030-01-02T06:00:00.000Z',
  'remainingBalanceDueAt': '2030-01-03T06:00:00.000Z',
  'hardPaymentDeadlineAt': '2030-01-04T06:00:00.000Z',
  'preparationStartsAt': '2030-01-04T06:00:00.000Z',
  'grossAmountInCentavos': 100001,
  'requiredUpfrontAmountInCentavos': deposit ? 30001 : 100001,
  'remainingBalanceInCentavos': deposit ? 70000 : 0,
  'depositEligible': deposit,
  'eligibilityReason': deposit ? 'deposit_eligible' : 'package_full_payment',
  'paymentDefaultAllocation': deposit
      ? {
          'schemaVersion': 1,
          'paidDepositInCentavos': 30001,
          'customerRefundRateBps': 7000,
          'providerReservationCompRateBps': 2000,
          'feastaCancellationFeeRateBps': 1000,
          'customerDefaultRefundAmountInCentavos': 21000,
          'providerReservationCompAmountInCentavos': 6000,
          'feastaCancellationFeeAmountInCentavos': 3001,
        }
      : null,
};
Map<String, dynamic> disclosureFixture([List<Object?>? agreements]) => {
  'bookingId': 'booking_123',
  'mainEventId': 'booking_123',
  'providerRequestIds': [],
  'created': false,
  'agreements': agreements ?? [agreementFixture()],
};
BookingSelection agreementSelection({
  String provider = 'provider_123',
  String package = 'package_123',
  String? tier = 'full_service',
  String? theme = 'garden',
  DateTime? date,
  String start = '14:00',
  String end = '18:00',
  int guests = 50,
  String type = 'wedding',
  String address = 'Main Street',
  String location = 'Ormoc City',
  String notes = '',
  bool own = false,
  String ownNotes = '',
  List<String> foods = const ['Rice'],
  List<String> decor = const ['Flowers'],
  List<String> furniture = const ['Tables'],
  List<Map<String, dynamic>> addons = const [],
}) => BookingSelection(
  providerId: provider,
  packageId: package,
  customization: EventCustomizationData(
    eventType: type,
    eventDate: date ?? DateTime(2030, 1, 5),
    eventTime: start,
    eventEndTime: end,
    guestCount: guests,
    eventLocation: location,
    eventAddress: address,
    selectedFoods: foods,
    selectedDecorations: decor,
    selectedFurniture: furniture,
    selectedAddOns: addons,
    willArrangeOwnAddOns: own,
    customerArrangedAddOnsNote: ownNotes,
    specialRequest: notes,
    serviceTier: tier,
    packageThemeId: theme,
  ),
);

Map<String, dynamic> marketplaceFixture({String id = 'addon_456'}) => {
  'addonId': id,
  'providerId': 'provider_456',
  'source': 'feasta_addon_provider',
};

Future<Set<String>> fixtureProviders(BookingAgreementRequest request) =>
    request.expectedProviderIds(
      lookupOwner: (id) async => switch (id) {
        'addon_123' => 'provider_123',
        'addon_456' || 'addon_789' => 'provider_456',
        _ => null,
      },
    );
