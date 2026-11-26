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

  test('special offer VAT and service charge use frozen pricing evidence', () {
    final offer = <String, dynamic>{
      'subtotalInCentavos': 2000000,
      'totalInCentavos': 2000000,
      'deliveryIncluded': true,
      'pricing': <String, dynamic>{
        'schemaVersion': 1,
        'currency': 'PHP',
        'grossAmountInCentavos': 2000000,
        'platformCommissionTotalInCentavos': 150000,
        'providerTaxType': 'vat_registered',
        'providerTaxVerificationStatus': 'verified',
      },
    };

    final vat = customerSpecialOfferVat(offer);
    expect(vat?.taxType, 'vat_registered');
    expect(vat?.includedVatInCentavos, 214286);
    expect(customerSpecialOfferProviderFeeInCentavos(offer), 150000);

    expect(
      customerSpecialOfferProviderFeeInCentavos({
        ...offer,
        'pricing': {
          ...(offer['pricing'] as Map),
          'grossAmountInCentavos': 1900000,
        },
      }),
      isNull,
    );
  });

  test(
    'customer_paid_flat_v1 computes Provider VAT strictly on provider subtotal',
    () {
      final vat = customerBookingVatFromRequest({
        'amount': 1002,
        'financialSnapshot': <String, dynamic>{
          'schemaVersion': 1,
          'currency': 'PHP',
          'serviceSubtotalInCentavos': 100000,
          'grossAmountInCentavos': 100200,
          'platformCommissionModel': 'customer_paid_flat_v1',
          'platformCommissionRateBps': 20,
          'platformCommissionTotalInCentavos': 200,
          'providerTaxType': 'vat_registered',
          'providerTaxVerificationStatus': 'verified',
        },
      });
      expect(vat?.taxType, 'vat_registered');
      expect(vat?.includedVatInCentavos, 10714);
      expect(vat?.grossInCentavos, 100000);
      expect(vat?.exclusiveInCentavos, 89286);
    },
  );
}
