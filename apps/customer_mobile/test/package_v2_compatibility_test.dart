import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/core/helpers/booking_preparation.dart';

void main() {
  for (final structure in ['fixed', 'customizable']) {
    for (final model in ['per_pax', 'per_bundle']) {
      test('$structure $model retains the customer contract', () {
        final food = List.filled(160, 'x').join();
        final p = PackageModel.fromMap('package', {
          'sharedContractVersion': 2, 'revision': 7,
          'offerStructure': structure, 'pricingModel': model,
          'isCustomizable': structure == 'fixed',
          'price': 100.25, 'minimumGuests': 10, 'maximumGuests': 50,
          'foodInclusions': [food],
          'imageUrls': ['https://example.com/a', 'https://example.com/b'],
          'paymentTermsSchemaVersion': 2, 'paymentPolicy': 'deposit_then_balance',
          'depositPercentage': 30, 'balanceDueDaysBeforeEvent': null,
          'balanceDueHoursBeforeEvent': 24,
          'serviceOptions': {
            'drop_off': {'price': 100.25, 'includedServices': []},
            'full_service': {'price': 250.75, 'includedServices': []},
          },
          'foodChoiceGroups': [{ 'id': 'main', 'title': 'Main', 'selectionCount': 2,
            'options': [{'id': 'a', 'name': 'Chicken'}, {'id': 'b', 'name': 'Fish'}]}],
        });
        expect(p.offerStructure, structure);
        expect(p.isCustomizable, structure == 'customizable');
        expect(p.pricingModel, model);
        expect(p.revision, 7);
        expect(p.foodInclusions, [food]);
        expect(p.imageUrls, ['https://example.com/a', 'https://example.com/b']);
        expect(p.imageUrl, p.imageUrls.first);
        expect(p.paymentTermsSchemaVersion, 2);
        expect(p.paymentPolicy, 'deposit_then_balance');
        expect(p.depositPercentage, 30);
        expect(p.balanceDueDaysBeforeEvent, isNull);
        expect(p.balanceDueHoursBeforeEvent, 24);
        expect(p.foodChoiceGroups.single.id, 'main');
        expect(p.foodChoiceGroups.single.selectionCount, 2);
        expect(p.foodChoiceGroups.single.options.keys, ['a', 'b']);
        expect(preparationEstimate(p, [], serviceTier: 'full_service', guests: 20),
          model == 'per_pax' ? 5015 : 250.75);
        expect(preparationEstimate(p, [], serviceTier: 'drop_off', guests: 20),
          model == 'per_pax' ? 2005 : 100.25);
        if (model == 'per_pax') {
          for (final guests in [null, 9, 51]) {
            expect(preparationEstimate(p, [], serviceTier: 'drop_off', guests: guests), isNull);
          }
        }
      });
    }
  }
  test('legacy identity and single image remain compatible without V2 inference', () {
    final p = PackageModel.fromMap('legacy', {'name': 'Fixed Per Pax', 'price': 100,
      'isCustomizable': false, 'imageUrl': 'https://example.com/legacy'});
    expect(p.offerStructure, isNull);
    expect(p.pricingModel, isNull);
    expect(p.isCustomizable, isFalse);
    expect(p.imageUrls, ['https://example.com/legacy']);
    expect(p.paymentPolicy, isNull);
  });
}
