import '../../shared/models/feasta_models.dart';
import 'provider_category_helper.dart';

/// Mirrors the public profile contract; the server owns the visibility flag.
bool isDiscoverableProvider(ProviderModel provider) =>
    provider.publiclyVisible &&
    provider.isPubliclyAvailable &&
    [
      provider.businessName,
      provider.description,
      provider.address,
      provider.city,
      provider.province,
    ].every((value) => value.trim().isNotEmpty) &&
    const {
      'catering',
      'addon',
      'both',
    }.contains(provider.providerServiceType) &&
    const {'ormoc', 'ormoc city'}.contains(provider.city.trim().toLowerCase());

bool matchesProviderDiscovery(
  ProviderModel provider, {
  String keyword = '',
  String? categoryCode,
  String eventType = 'All',
  String location = '',
  double? minBudget,
  double? maxBudget,
}) {
  if (!isDiscoverableProvider(provider)) return false;
  final category = categoryCode?.trim().toLowerCase() ?? '';
  if (category.isNotEmpty &&
      provider.providerCategory.toLowerCase() != category) {
    return false;
  }
  final searchable =
      '${provider.businessName} ${provider.providerServiceType} '
              '${provider.providerCategory} ${providerCategoryLabel(provider.providerCategory)}'
          .toLowerCase()
          .replaceAll('_', ' ');
  final terms = keyword.trim().toLowerCase().split(RegExp(r'[\s_/&-]+'));
  if (!terms.every((term) => searchable.contains(term))) return false;
  if (eventType.toLowerCase() != 'all' &&
      eventType.trim().isNotEmpty &&
      !provider.eventTypesSupported.any(
        (type) => type.toLowerCase() == eventType.toLowerCase(),
      )) {
    return false;
  }
  final area = '${provider.location} ${provider.address} ${provider.city}'
      .toLowerCase();
  if (!area.contains(location.trim().toLowerCase())) return false;
  if (minBudget != null || maxBudget != null) {
    // Missing/zero prices are unknown, never a free or budget-friendly offer.
    if (!provider.minPrice.isFinite || provider.minPrice <= 0) return false;
    if (minBudget != null && (!minBudget.isFinite || minBudget < 0)) {
      return false;
    }
    if (maxBudget != null && (!maxBudget.isFinite || maxBudget < 0)) {
      return false;
    }
    if (minBudget != null && maxBudget != null && minBudget > maxBudget) {
      return false;
    }
    final upper = provider.maxPrice >= provider.minPrice
        ? provider.maxPrice
        : provider.minPrice;
    if (minBudget != null && upper < minBudget) return false;
    if (maxBudget != null && provider.minPrice > maxBudget) return false;
  }
  return true;
}

/// Name relevance only; eligibility and supported keyword fields stay unchanged.
/// Lower ranks appear first. An empty query has no name preference.
int providerBusinessNameSearchRank(ProviderModel provider, String keyword) {
  final query = keyword.trim().toLowerCase();
  if (query.isEmpty) return 0;
  final name = provider.businessName.trim().toLowerCase();
  if (name.startsWith(query)) return 0;
  // Punctuation, including apostrophes and hyphens, separates name words.
  final words = name.split(RegExp(r"[^\p{L}\p{N}]+", unicode: true));
  if (words.any((word) => word.startsWith(query))) return 1;
  if (name.contains(query)) return 2;
  return 3;
}

/// Deterministic ties do not depend on Firestore snapshot order or sort stability.
int compareProviderSearchRelevance(
  ProviderModel a,
  ProviderModel b,
  String keyword,
) {
  final rank = providerBusinessNameSearchRank(
    a,
    keyword,
  ).compareTo(providerBusinessNameSearchRank(b, keyword));
  if (rank != 0) return rank;
  final name = a.businessName.trim().toLowerCase().compareTo(
    b.businessName.trim().toLowerCase(),
  );
  return name != 0 ? name : a.id.compareTo(b.id);
}
