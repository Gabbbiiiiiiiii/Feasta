import '../../../core/helpers/booking_preparation.dart';
import '../../../shared/models/customer_event_list.dart';
import '../../../shared/models/feasta_models.dart';
import '../../authentication/data/repositories/feasta_repository.dart';
import 'event_list_review_models.dart';

typedef EventListPackageLookup =
    Future<PackageModel?> Function(String providerId, String packageId);

class EventListCatalog {
  EventListCatalog({EventListPackageLookup? lookup})
    : _lookup =
          lookup ??
          ((providerId, packageId) => FeastaRepository()
              .getEligiblePackageForPreparation(providerId, packageId));
  final EventListPackageLookup _lookup;

  Future<EventListCatalogResult> check(CustomerEventListEntry entry) async {
    try {
      final package = await _lookup(entry.providerId, entry.packageId);
      if (package == null) {
        return const EventListCatalogResult(EventListCatalogStatus.unavailable);
      }
      // Unexpected identities are verification failures, never evidence of deletion.
      if (package.id != entry.packageId ||
          package.providerId != entry.providerId ||
          !eligiblePreparationPackage(package, entry.providerId)) {
        return const EventListCatalogResult(
          EventListCatalogStatus.couldNotVerify,
        );
      }
      if (!knownPreparationPrice(package.price)) {
        return const EventListCatalogResult(
          EventListCatalogStatus.priceUnavailable,
        );
      }
      return EventListCatalogResult(
        EventListCatalogStatus.eligible,
        latestPrice: package.price,
      );
    } catch (_) {
      return const EventListCatalogResult(
        EventListCatalogStatus.couldNotVerify,
      );
    }
  }
}
