import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/customer_payment_request.dart';

void main() {
  final validRequest = <String, dynamic>{
    'amount': 20000,
    'financialSnapshot': <String, dynamic>{
      'schemaVersion': 1,
      'currency': 'PHP',
      'grossAmountInCentavos': 2000000,
      'providerTaxType': 'vat_registered',
      'providerTaxVerificationStatus': 'verified',
    },
  };

  test('shows the VAT already included in the service price', () {
    final vat = customerBookingVatFromRequest(validRequest);
    expect(vat?.taxType, 'vat_registered');
    expect(vat?.includedVatInCentavos, 214286);
    expect(vat?.grossInCentavos, 2000000);
    expect(vat?.exclusiveInCentavos, 1785714);
    expect(
      vat!.exclusiveInCentavos + vat.includedVatInCentavos,
      vat.grossInCentavos,
    );
  });

  test('verified Non-VAT has no VAT component', () {
    final snapshot = Map<String, dynamic>.from(
      validRequest['financialSnapshot'] as Map,
    );
    snapshot['providerTaxType'] = 'non_vat';

    final vat = customerBookingVatFromRequest({
      ...validRequest,
      'financialSnapshot': snapshot,
    });

    expect(vat?.taxType, 'non_vat');
    expect(vat?.includedVatInCentavos, 0);
  });

  test('unverified status cannot produce VAT disclosure', () {
    final snapshot = Map<String, dynamic>.from(
      validRequest['financialSnapshot'] as Map,
    );
    snapshot['providerTaxVerificationStatus'] = 'pending';

    expect(
      customerBookingVatFromRequest({
        ...validRequest,
        'financialSnapshot': snapshot,
      }),
      isNull,
    );
  });

  test('mismatched booking amount is rejected', () {
    expect(
      customerBookingVatFromRequest({...validRequest, 'amount': 19000}),
      isNull,
    );
  });

  test('missing snapshot is unavailable', () {
    expect(customerBookingVatFromRequest({'amount': 20000}), isNull);
  });

  test('fractional centavo amount is rejected', () {
    expect(
      customerBookingVatFromRequest({...validRequest, 'amount': 20000.001}),
      isNull,
    );
  });
}
