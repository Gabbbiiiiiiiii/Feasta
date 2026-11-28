import 'package:feasta/features/authentication/data/repositories/feasta_repository.dart';
import 'package:feasta/features/customer/best_fit_controller.dart';
import 'package:feasta/features/customer/marketplace_availability.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeBestFitRepository implements FeastaRepository {
  FakeBestFitRepository(this.catalogs);

  final Map<String, List<AddonModel>> catalogs;
  final List<String> catalogRequests = [];

  @override
  Future<List<AddonModel>> bestFitEventServices(String providerId) async {
    catalogRequests.add(providerId);
    return catalogs[providerId] ?? <AddonModel>[];
  }

  @override
  Stream<List<PackageModel>> packagesByProvider(String providerId) =>
      Stream.value(<PackageModel>[]);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ProviderModel eligibleProvider(String id, String category) => ProviderModel(
  id: id,
  ownerId: 'owner_$id',
  businessName: 'Business $id',
  businessEmail: '',
  businessPhone: '',
  ownerFirstName: '',
  ownerLastName: '',
  description: 'Professional event services',
  location: 'Ormoc City, Leyte',
  address: 'Main Street',
  city: 'Ormoc City',
  province: 'Leyte',
  serviceAreas: const ['Ormoc City, Leyte'],
  eventTypesSupported: const ['birthday'],
  minPrice: 1000,
  maxPrice: 20000,
  ratingAverage: 0,
  reviewCount: 0,
  totalCompletedBookings: 0,
  totalViews: 0,
  favoriteCount: 0,
  verificationStatus: 'approved',
  providerServiceType: 'addon',
  providerCategory: category,
  serviceCategories: [category],
  maxEventsPerDay: 1,
  availableStaffCount: 0,
  availableEquipmentCount: 0,
  acceptsMultipleEventsPerDay: false,
  isActive: true,
  isFeatured: false,
  publiclyVisible: true,
  isSuspended: false,
  isDeleted: false,
);

AddonModel eligibleService(
  String id,
  String providerId,
  String category,
  double price,
) => AddonModel(
  id: id,
  providerId: providerId,
  name: 'Service $id',
  description: 'Professional event service',
  category: category,
  price: price,
  pricingType: 'fixed',
  isAvailable: true,
  isActive: true,
  providerBusinessName: providerId,
  providerType: 'addon_provider',
);

void main() {
  test('loads eligible offers from two separate provider catalogs', () async {
    final repository = FakeBestFitRepository({
      'photo_provider': [
        eligibleService('photo_offer', 'photo_provider', 'photographer', 1500),
      ],
      'video_provider': [
        eligibleService('video_offer', 'video_provider', 'videographer', 2000),
      ],
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
      categories: ['photographer', 'videographer'],
      minimumBudgetCentavos: 100000,
      maximumBudgetCentavos: 500000,
    );

    final result = await loadBestFit(
      event,
      [
        eligibleProvider('photo_provider', 'photographer'),
        eligibleProvider('video_provider', 'videographer'),
      ],
      repository: repository,
      availability: (ids, schedule) async => [
        for (final id in ids) MarketplaceAvailability(id, true, 'Available'),
      ],
    );

    expect(repository.catalogRequests.toSet(), {
      'photo_provider',
      'video_provider',
    });

    expect(result.offers.length, 2);
    expect(result.selected['photographer']?.provider.id, 'photo_provider');
    expect(result.selected['videographer']?.provider.id, 'video_provider');
    expect(result.totalCentavos, 350000);
    expect(result.incompleteCatalog, isFalse);
  });
}
