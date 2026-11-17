import '../../core/helpers/best_fit_area.dart';
import 'package:flutter/foundation.dart';

import '../../core/helpers/provider_discovery.dart';
import '../../shared/models/customer_address_model.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'marketplace_availability.dart';

const minPlanningBudgetPesos = 1000;
const maxPlanningBudgetPesos = 1000000;

class BestFitEvent {
  BestFitEvent({
    required this.schedule,
    required this.occasion,
    required this.venue,
    required Iterable<String> categories,
    required this.minimumBudgetCentavos,
    required this.maximumBudgetCentavos,
  }) : categories = Set.unmodifiable(categories);

  final MarketplaceEventContext schedule;
  final String occasion;
  final CustomerAddressModel venue;
  final Set<String> categories;
  final int minimumBudgetCentavos;
  final int maximumBudgetCentavos;

  String? validate(DateTime now) {
    if (minimumBudgetCentavos < minPlanningBudgetPesos * 100 ||
        maximumBudgetCentavos < minPlanningBudgetPesos * 100) {
      return 'Amount entered is lower than the allowed budget.';
    }
    if (maximumBudgetCentavos > maxPlanningBudgetPesos * 100 ||
        minimumBudgetCentavos > maxPlanningBudgetPesos * 100) {
      return 'Enter a budget of ₱1,000,000 or less.';
    }
    if (maximumBudgetCentavos < minimumBudgetCentavos) {
      return 'Maximum budget must be at least the starting budget.';
    }
    if (occasion.trim().isEmpty ||
        categories.isEmpty ||
        normalizeBestFitArea(venue.city, province: venue.province) == null) {
      return 'Choose an occasion, supported venue, and at least one service.';
    }
    return schedule.validate(now);
  }
}

class BestFitOffer {
  const BestFitOffer({
    required this.category,
    required this.provider,
    required this.centavos,
    this.package,
    this.service,
    this.serviceTier,
  }) : assert((package == null) != (service == null));

  final String category;
  final ProviderModel provider;
  final int centavos;
  final PackageModel? package;
  final AddonModel? service;
  final String? serviceTier;

  String get id => package != null
      ? 'package:${package!.id}:${serviceTier ?? ""}'
      : 'service:${service!.id}';
  String get name => package?.name ?? service!.name;
}

enum BestFitUnmatched { unavailable, serviceArea, noEligibleOffer, budget }

class BestFitResult {
  BestFitResult._(
    this.event,
    this.offers,
    Map<String, BestFitOffer> selected,
    this.reasons,
    this.incompleteCatalog,
  ) : selected = Map.unmodifiable(selected);

  final BestFitEvent event;
  final List<BestFitOffer> offers;
  final Map<String, BestFitOffer> selected;
  final Map<String, BestFitUnmatched> reasons;
  final bool incompleteCatalog;

  int get totalCentavos =>
      selected.values.fold(0, (sum, item) => sum + item.centavos);
  int get remainingCentavos => event.maximumBudgetCentavos - totalCentavos;

  BestFitUnmatched? unmatched(String category) => selected.containsKey(category)
      ? null
      : reasons[category] ?? BestFitUnmatched.budget;

  Iterable<BestFitOffer> alternatives(String category) => offers.where(
    (offer) =>
        offer.category == category &&
        offer.id != selected[category]?.id &&
        offer.centavos <=
            remainingCentavos + (selected[category]?.centavos ?? 0),
  );

  BestFitResult? replace(String category, String offerId) {
    for (final offer in alternatives(category)) {
      if (offer.id == offerId) {
        return BestFitResult._(
          event,
          offers,
          {...selected, category: offer},
          reasons,
          incompleteCatalog,
        );
      }
    }
    return null;
  }
}

typedef BestFitAvailabilityLoader =
    Future<List<MarketplaceAvailability>> Function(
      List<String> providerIds,
      MarketplaceEventContext schedule,
    );

/// Keeps the last successful result visible while a new search runs.
class BestFitController extends ChangeNotifier {
  BestFitController({
    required this._repository,
    this._availability = checkMarketplaceAvailability,
  });

  final FeastaRepository _repository;
  final BestFitAvailabilityLoader _availability;
  int _generation = 0;
  bool _disposed = false;
  BestFitResult? result;
  bool loading = false;
  String? error;

  Future<void> search(
    BestFitEvent event, [
    Iterable<ProviderModel>? providers,
  ]) async {
    if (_disposed) return;
    final generation = ++_generation;
    error = event.validate(DateTime.now());
    loading = error == null;
    notifyListeners();
    if (!loading) return;
    try {
      final candidates =
          providers ??
          await _repository
              .searchAllVerifiedProviders(
                keyword: '',
                eventType: 'All',
                location: '',
                minBudget: null,
                maxBudget: null,
              )
              .first
              .timeout(const Duration(seconds: 20));
      if (_disposed || generation != _generation) return;
      final next = await loadBestFit(
        event,
        candidates,
        repository: _repository,
        availability: _availability,
      );
      if (!_disposed && generation == _generation) result = next;
    } catch (_) {
      if (!_disposed && generation == _generation) {
        error = 'Best Fit could not check your event. Try again.';
      }
    } finally {
      if (!_disposed && generation == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }

  void restoreDefaultSuggestions() {
    final current = result;
    if (_disposed || loading || current == null) return;
    result = rankBestFitOffers(
      current.event,
      current.offers,
      reasons: current.reasons,
      incompleteCatalog: current.incompleteCatalog,
    );
    notifyListeners();
  }

  bool replace(String category, String offerId) {
    if (_disposed || loading || error != null) return false;
    final next = result?.replace(category, offerId);
    if (next == null) return false;
    result = next;
    notifyListeners();
    return true;
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

Future<BestFitResult> loadBestFit(
  BestFitEvent event,
  Iterable<ProviderModel> candidates, {
  required FeastaRepository repository,
  BestFitAvailabilityLoader availability = checkMarketplaceAvailability,
}) async {
  final providers = {
    for (final provider in candidates)
      if (isDiscoverableProvider(provider) &&
          _categories(provider).any(event.categories.contains))
        provider.id: provider,
  };
  final checked = providers.isEmpty
      ? const <MarketplaceAvailability>[]
      : await availability(providers.keys.toList(), event.schedule);
  final available = {
    for (final item in checked)
      if (item.available && providers.containsKey(item.providerId))
        item.providerId: providers[item.providerId]!,
  };
  final area = normalizeBestFitArea(
    event.venue.city,
    province: event.venue.province,
  );
  final serving = available.values
      .where(
        (provider) =>
            area != null &&
            provider.serviceAreas.any(
              (value) => sameMunicipality(normalizeBestFitArea(value), area),
            ),
      )
      .toList();
  var incomplete = false;
  Future<List<T>> attempt<T>(Future<List<T>> Function() read) async {
    try {
      return await read().timeout(const Duration(seconds: 20));
    } catch (_) {
      incomplete = true;
      return [];
    }
  }

  final packageProviders = serving.where(
    (provider) => provider.providerServiceType != 'addon',
  );
  final serviceProviders = serving
      .where((provider) => provider.providerServiceType != 'catering')
      .toList();
  final offers = <BestFitOffer>[];

  // Read all eligible provider service catalogs. A failed catalog
  // does not discard successful catalogs from other providers.
  final services = Future.wait<List<AddonModel>>(
    serviceProviders.map(
      (provider) => attempt(() => repository.bestFitEventServices(provider.id)),
    ),
  );

  await Future.wait(
    packageProviders.map((provider) async {
      final packages = await attempt(
        () => repository.packagesByProvider(provider.id).first,
      );
      for (final package in packages) {
        if (package.providerId != provider.id ||
            event.schedule.guestCount < package.minimumGuests ||
            event.schedule.guestCount > package.maximumGuests ||
            package.minimumGuests < 1 ||
            !(package.occasionMatchIds.isEmpty
                    ? [package.eventType]
                    : package.occasionMatchIds)
                .contains(event.occasion)) {
          continue;
        }
        final category = package.serviceCategoryCode ?? 'catering_service';
        if (!event.categories.contains(category) ||
            !_categories(provider).contains(category)) {
          continue;
        }
        if (package.pricingModel == null) {
          final centavos = _centavos(package.price);
          if (centavos != null) {
            offers.add(
              BestFitOffer(
                category: category,
                provider: provider,
                centavos: centavos,
                package: package,
              ),
            );
          }
        } else {
          for (final tier in ['drop_off', 'buffet_setup', 'full_service']) {
            final centavos = _centavos(package.serviceOptions[tier]?['price']);
            if (centavos == null) continue;
            offers.add(
              BestFitOffer(
                category: category,
                provider: provider,
                package: package,
                serviceTier: tier,
                centavos:
                    centavos *
                    (package.pricingModel == 'per_pax'
                        ? event.schedule.guestCount
                        : 1),
              ),
            );
          }
        }
      }
    }),
  );
  final serviceById = {
    for (final provider in serviceProviders) provider.id: provider,
  };
  for (final service in (await services).expand((items) => items)) {
    final provider = serviceById[service.providerId];
    final cents = _centavos(service.price);
    if (provider == null ||
        cents == null ||
        !provider.eventTypesSupported.contains(event.occasion) ||
        !event.categories.contains(service.category) ||
        !_categories(provider).contains(service.category)) {
      continue;
    }
    final quantity = switch (service.pricingType) {
      'fixed' => 1,
      'per_guest' => event.schedule.guestCount,
      _ => null,
    };
    if (quantity == null) {
      if (service.pricingType == null) incomplete = true;
      continue;
    }
    offers.add(
      BestFitOffer(
        category: service.category,
        provider: provider,
        centavos: cents * quantity,
        service: service,
      ),
    );
  }

  final reasons = <String, BestFitUnmatched>{};
  for (final category in event.categories) {
    if (offers.any((offer) => offer.category == category)) continue;
    final categoryProviders = providers.values.where(
      (provider) => _categories(provider).contains(category),
    );
    final categoryAvailable = categoryProviders.where(
      (provider) => available.containsKey(provider.id),
    );
    reasons[category] =
        categoryProviders.isNotEmpty && categoryAvailable.isEmpty
        ? BestFitUnmatched.unavailable
        : categoryAvailable.isNotEmpty &&
              !serving.any(
                (provider) => _categories(provider).contains(category),
              )
        ? BestFitUnmatched.serviceArea
        : BestFitUnmatched.noEligibleOffer;
  }
  return rankBestFitOffers(
    event,
    offers,
    reasons: reasons,
    incompleteCatalog: incomplete,
  );
}

/// Cheapest eligible offer per category, then lowest costs first to maximize coverage.
BestFitResult rankBestFitOffers(
  BestFitEvent event,
  Iterable<BestFitOffer> candidates, {
  Map<String, BestFitUnmatched> reasons = const {},
  bool incompleteCatalog = false,
}) {
  final offers =
      candidates
          .where(
            (offer) =>
                event.categories.contains(offer.category) && offer.centavos > 0,
          )
          .toList()
        ..sort((a, b) {
          final price = a.centavos.compareTo(b.centavos);
          if (price != 0) return price;
          final provider = a.provider.id.compareTo(b.provider.id);
          return provider != 0 ? provider : a.id.compareTo(b.id);
        });
  var remaining = event.maximumBudgetCentavos;
  final selected = <String, BestFitOffer>{};
  for (final offer in offers) {
    if (selected.containsKey(offer.category) || offer.centavos > remaining) {
      continue;
    }
    selected[offer.category] = offer;
    remaining -= offer.centavos;
  }
  return BestFitResult._(
    event,
    List.unmodifiable(offers),
    selected,
    Map.unmodifiable(reasons),
    incompleteCatalog,
  );
}

Set<String> _categories(ProviderModel provider) => {
  ...providerDiscoveryCategories(provider),
  if (provider.providerCategory.isNotEmpty) provider.providerCategory,
};

int? _centavos(Object? value) =>
    value is num && value.isFinite && value > 0 && value <= 100000000
    ? (value * 100).round()
    : null;
