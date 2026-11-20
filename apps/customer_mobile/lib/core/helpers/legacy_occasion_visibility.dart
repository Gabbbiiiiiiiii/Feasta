import '../services/occasion_catalog_service.dart';
/// Phase 2C legacy-client safety filter.
///
/// This is defense-in-depth, not an authorization boundary. Older installed
/// Flutter applications cannot receive this update automatically, and direct
/// Firestore reads remain possible under existing rules. The backend must keep
/// V2 packages withdrawn until all public readers are covered by a verified
/// server-enforced strategy and release approval.
const _v2OccasionFields = <String>{
  'occasionScope',
  'occasionIds',
  'occasionMatchIds',
  'occasionCatalogRevision',
  'providerEligibilityRevision',
  'occasionEligibilityState',
  'foodChoiceGroups',
};

/// A legacy V1 display or preparation path may accept records with no occasion
/// V2 tuple and an absent or explicit V1 schema marker only.
/// Presence of a V2 field (even null) must not be silently stripped.
bool isLegacyOccasionPublicPackage(Map<String, dynamic> data) {
  // The legacy Flutter price model cannot consume V2 per-pax or bundle pricing.
  if (data.containsKey('pricingModel') ||
      (data.containsKey('offerSchemaVersion') &&
          data['offerSchemaVersion'] != 1)) {
    return false;
  }
  if (data.containsKey('occasionSchemaVersion') &&
      data['occasionSchemaVersion'] != 1) {
    return false;
  }
  return !_v2OccasionFields.any(data.containsKey);
}

/// Current active-catalog eligibility for a legacy customer package.
/// The catalog must come from the authoritative listApprovedOccasions callable.
bool isLegacyOccasionActiveInCatalog(
  Map<String, dynamic> package,
  List<CatalogOccasion> activeOccasions,
) {
  if (!isLegacyOccasionPublicPackage(package)) return false;

  final eventType = package['eventType'];
  if (eventType is! String) return false;

  final value = eventType.trim().toLowerCase();
  if (value.isEmpty) return false;

  return activeOccasions.any(
    (occasion) =>
        occasion.id == value ||
        occasion.label.toLowerCase() == value,
  );
}