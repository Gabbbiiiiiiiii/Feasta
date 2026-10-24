import '../../shared/models/feasta_models.dart';
import '../domain/service_category.dart';

Map<String, String> serviceCategoryNameMap(
  Iterable<ServiceCategory> categories,
) {
  return <String, String>{
    for (final category in categories) category.code: category.name,
  };
}

String providerCategoryLabel(
  String category, {
  Map<String, String> categoryNames = const <String, String>{},
}) {
  final normalized = category.trim();

  if (normalized.isEmpty) {
    return 'Service';
  }

  final masterName = categoryNames[normalized]?.trim();

  if (masterName != null && masterName.isNotEmpty) {
    return masterName;
  }

  return humanizeServiceCategoryCode(normalized);
}

/// Tabs backed by existing public packages, menu items, images and reviews.
List<String> providerProfileTabs(ProviderModel provider) {
  final category = provider.providerCategory.trim().toLowerCase().replaceAll(
    RegExp(r'[^a-z0-9]+'),
    '_',
  );
  final words = category.split('_').toSet();
  if (words.intersection({
    'photographer',
    'photography',
    'videographer',
    'videography',
  }).isNotEmpty) {
    return const ['Packages', 'Portfolio', 'Reviews'];
  }
  // Florists have no structured catalog source. Use public photos instead.
  if (words.intersection({
    'florist',
    'floral',
    'flower',
    'flowers',
  }).isNotEmpty) {
    return const ['Packages', 'Photos', 'Reviews'];
  }
  if (words.intersection({
        'catering',
        'caterer',
        'cake',
        'cakes',
        'pastry',
        'pastries',
        'bakery',
      }).isNotEmpty ||
      provider.providerServiceType.trim().toLowerCase() == 'catering') {
    return const ['Packages', 'Menu', 'Photos', 'Reviews'];
  }
  return const ['Packages', 'Photos', 'Reviews'];
}
