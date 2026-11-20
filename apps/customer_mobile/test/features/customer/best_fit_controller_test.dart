import 'package:feasta/core/helpers/best_fit_area.dart';
import 'package:feasta/features/customer/best_fit_controller.dart';
import 'package:feasta/features/customer/marketplace_availability.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter_test/flutter_test.dart';

import 'provider_discovery_test.dart' show provider;

void main() {
  test('matches locality aliases nationwide and distinguishes provinces', () {
    for (final (city, province) in [
      ('Ormoc City', 'Leyte'),
      ('Palompon', 'Leyte'),
      ('Baybay City', 'Leyte'),
      ('Baguio City', 'Benguet'),
      ('San Fernando', 'Pampanga'),
      ('Tagum City', 'Davao del Norte'),
      ('Taytay', 'Rizal'),
    ]) {
      expect(
        sameMunicipality(
          normalizeBestFitArea(city, province: province),
          normalizeBestFitArea('$city, $province, Philippines'),
        ),
        isTrue,
      );
    }
    expect(
      sameMunicipality(
        normalizeBestFitArea('Baybay'),
        normalizeBestFitArea('City of Baybay, Eastern Visayas'),
      ),
      isTrue,
    );
    expect(
      sameMunicipality(
        normalizeBestFitArea('San Fernando, Pampanga'),
        normalizeBestFitArea('San Fernando, La Union'),
      ),
      isFalse,
    );
    expect(
      normalizeBestFitArea('San Fernando, Pampanga', province: 'La Union'),
      isNull,
    );
  });

  final event = BestFitEvent(
    schedule: const MarketplaceEventContext(
      eventDate: '2099-11-19',
      eventTime: '13:30',
      eventEndTime: '18:30',
      guestCount: 50,
    ),
    occasion: 'birthday',
    venue: CustomerAddressModel.defaultOrmoc,
    categories: ['catering_service', 'photographer', 'videographer'],
    minimumBudgetCentavos: 300000,
    maximumBudgetCentavos: 500000,
  );

  BestFitOffer option(String id, String category, int cents) => BestFitOffer(
    category: category,
    provider: provider(id: id),
    centavos: cents,
    service: AddonModel(
      id: id,
      providerId: id,
      name: id,
      description: '',
      category: category,
      price: cents / 100,
      isAvailable: true,
      isActive: true,
      providerBusinessName: id,
      providerType: 'addon_provider',
    ),
  );

  test(
    'maximizes category coverage and recalculates only affordable replacements',
    () {
      final result = rankBestFitOffers(event, [
        option('buffet', 'catering_service', 250000),
        option('full', 'catering_service', 350000),
        option('premium', 'catering_service', 450000),
        option('photo', 'photographer', 150000),
        option('video', 'videographer', 200000),
      ]);
      expect(result.selected.keys, ['photographer', 'videographer']);
      expect(result.totalCentavos, 350000);
      expect(result.unmatched('catering_service'), BestFitUnmatched.budget);

      final plan = rankBestFitOffers(event, [
        option('buffet', 'catering_service', 250000),
        option('full', 'catering_service', 350000),
        option('premium', 'catering_service', 450000),
        option('photo', 'photographer', 150000),
      ]);
      expect(plan.remainingCentavos, 100000);
      expect(plan.alternatives('catering_service').map((entry) => entry.id), [
        'service:full',
      ]);
      expect(plan.replace('catering_service', 'service:premium'), isNull);
      expect(
        plan.replace('catering_service', 'service:full')!.remainingCentavos,
        0,
      );
      expect(plan.remainingCentavos, 100000);
    },
  );
}
