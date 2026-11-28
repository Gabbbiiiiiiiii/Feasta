/// Customer-only VAT preview; authoritative allocation remains in Functions.
class CustomerProviderVatBreakdown {
  const CustomerProviderVatBreakdown({
    required this.exclusiveCentavos,
    required this.vatCentavos,
  });
  final int exclusiveCentavos;
  final int vatCentavos;
}

CustomerProviderVatBreakdown? customerProviderVatBreakdown(
  num? servicePrice,
  String? status,
) {
  if (status != 'vat_registered' ||
      servicePrice == null ||
      !servicePrice.isFinite ||
      servicePrice < 0) {
    return null;
  }
  final gross = (servicePrice * 100).round();
  if (gross < 0 || gross * 1200 > 9007199254740991) return null;
  final vat = (gross * 1200 / 11200).round();
  return CustomerProviderVatBreakdown(
    exclusiveCentavos: gross - vat,
    vatCentavos: vat,
  );
}
