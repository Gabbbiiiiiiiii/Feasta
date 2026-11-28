import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/provider_vat_preview.dart';

void main() {
  test('1850 PHP VAT inclusive', () {
    final result = customerProviderVatBreakdown(1850, 'vat_registered')!;
    expect(result.exclusiveCentavos, 165179);
    expect(result.vatCentavos, 19821);
    expect(result.exclusiveCentavos + result.vatCentavos, 185000);
  });
  test('Non-VAT and unverified never invent VAT', () {
    expect(customerProviderVatBreakdown(1850, 'non_vat'), isNull);
    expect(customerProviderVatBreakdown(1850, 'unknown'), isNull);
    expect(customerProviderVatBreakdown(1850, null), isNull);
  });
  test('bad prices never invent VAT', () {
    for (final price in <num?>[null, -1, double.nan, double.infinity]) {
      expect(customerProviderVatBreakdown(price, 'vat_registered'), isNull);
    }
  });
  test('price changes recalculate', () {
    final result = customerProviderVatBreakdown(2240, 'vat_registered')!;
    expect(result.exclusiveCentavos, 200000);
    expect(result.vatCentavos, 24000);
  });
  test('integer centavo rounding', () {
    final result = customerProviderVatBreakdown(1, 'vat_registered')!;
    expect(result.exclusiveCentavos, 89);
    expect(result.vatCentavos, 11);
  });
}
