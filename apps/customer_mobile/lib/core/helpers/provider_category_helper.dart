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
