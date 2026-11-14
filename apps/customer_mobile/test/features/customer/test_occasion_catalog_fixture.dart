import 'package:feasta/core/services/occasion_catalog_service.dart';

/// Deterministic offline catalog used only by Flutter widget tests.
Future<List<CatalogOccasion>> testOccasionLoader() async {
  return const <CatalogOccasion>[
    CatalogOccasion(
      id: 'birthday',
      label: 'Birthday',
      sortOrder: 1,
      revision: 1,
      applicableServiceCategoryCodes: <String>['catering_service'],
    ),
    CatalogOccasion(
      id: 'wedding',
      label: 'Wedding',
      sortOrder: 2,
      revision: 1,
      applicableServiceCategoryCodes: <String>['catering_service'],
    ),
  ];
}
