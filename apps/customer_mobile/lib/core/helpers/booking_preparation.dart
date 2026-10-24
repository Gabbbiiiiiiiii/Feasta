import '../../shared/models/feasta_models.dart';
import '../../shared/models/event_customization_data.dart';

bool eligiblePreparationPackage(PackageModel package, String providerId) =>
    package.providerId == providerId &&
    package.isActive &&
    package.isPublished &&
    package.providerPubliclyVisible &&
    !package.isDeleted &&
    package.status == 'published';

const preparationServiceLabels = {
  'drop_off': 'Drop-Off Catering',
  'buffet_setup': 'Buffet Setup',
  'full_service': 'Full-Service Catering',
};

String serviceOptionTitle(String id, Map<String, dynamic> data) =>
    (data['title'] ?? data['name'] ?? preparationServiceLabels[id] ?? id)
        .toString();

bool knownPreparationPrice(num? value) =>
    value != null && value.isFinite && value >= 0;

Map<String, Map<String, dynamic>> preparationServices(PackageModel package) => {
  for (final entry in package.serviceOptions.entries)
    if (preparationServiceLabels.containsKey(entry.key)) entry.key: entry.value,
};

List<Map<String, dynamic>> preparationThemes(PackageModel package) =>
    package.themeOptions.where((theme) {
      final id = theme['id'];
      return id is String &&
          id.trim().isNotEmpty &&
          theme['name'] is String &&
          (theme['name'] as String).trim().isNotEmpty &&
          package.themeOptions.where((item) => item['id'] == id).length == 1;
    }).toList();

int preparationMinimumGuests(PackageModel package) =>
    package.minimumGuests > 0 ? package.minimumGuests : 1;
int? preparationMaximumGuests(PackageModel package) => package.maximumGuests > 0
    ? package.maximumGuests
    : package.guestCapacity > 0
    ? package.guestCapacity
    : null;

double? preparationBasePrice(PackageModel package, {String? serviceTier}) {
  final services = preparationServices(package);
  final base = services.isEmpty
      ? package.price
      : services[serviceTier]?['price'];
  return base is num && knownPreparationPrice(base) ? base.toDouble() : null;
}

double? preparationEstimate(
  PackageModel package,
  List<Map<String, dynamic>> addons, {
  String? serviceTier,
}) {
  final base = preparationBasePrice(package, serviceTier: serviceTier);
  if (base == null) return null;
  var total = base;
  for (final addon in addons) {
    final price = addon['price'];
    if (price is! num || !knownPreparationPrice(price)) return null;
    total += price;
  }
  return total.isFinite ? total : null;
}

String? validatePreparation({
  required PackageModel package,
  required String providerId,
  required DateTime? date,
  required int? startMinutes,
  required int? endMinutes,
  required int guests,
  required String city,
  required String address,
  required List<String> foods,
  required List<String> decorations,
  required List<String> furniture,
  String? serviceTier,
  String? themeId,
  String? eventType,
  DateTime? now,
  bool validatePackageOptions = true,
}) {
  if (!eligiblePreparationPackage(package, providerId)) {
    return 'This package is no longer available from this provider.';
  }
  if (eventType != null &&
      package.eventType.trim().isNotEmpty &&
      eventType != package.eventType.trim()) {
    return 'This package supports ${package.eventType} events. Please choose the current event type.';
  }
  if (date == null) return 'Please select an event date.';
  if (startMinutes == null) return 'Please select an event start time.';
  if (endMinutes == null ||
      endMinutes <= startMinutes ||
      endMinutes > 1439 ||
      startMinutes < 0) {
    return 'Event end time must be later than the start time.';
  }
  final start = DateTime(
    date.year,
    date.month,
    date.day,
    startMinutes ~/ 60,
    startMinutes % 60,
  );
  if (!start.isAfter(now ?? DateTime.now())) {
    return 'Choose a future event date and start time.';
  }
  final maximum = preparationMaximumGuests(package);
  if (guests > 10000 ||
      guests < preparationMinimumGuests(package) ||
      (maximum != null && guests > maximum)) {
    return "Guest count is outside this package's supported range.";
  }
  if (city.trim().toLowerCase() != 'ormoc city') {
    return 'Event location must be Ormoc City.';
  }
  if (address.trim().isEmpty) return 'Please enter the complete event address.';
  if (address.trim().length > 500 || city.trim().length > 180) {
    return 'Event location or address is too long.';
  }
  if ([foods, decorations, furniture].any(
    (values) =>
        values.length > 50 ||
        values.any((v) => v.trim().isEmpty || v.trim().length > 120),
  )) {
    return 'Package selections exceed the supported field limits.';
  }
  if (!validatePackageOptions) return null;
  bool allowed(List<String> chosen, List<String> options) =>
      chosen.toSet().length == chosen.length && chosen.every(options.contains);
  if (!allowed(foods, package.foodInclusions) ||
      !allowed(decorations, package.decorInclusions) ||
      !allowed(furniture, package.furnitureInclusions)) {
    return 'Package options changed. Please select the current options again.';
  }
  if (!package.isCustomizable &&
      (foods.length != package.foodInclusions.length ||
          decorations.length != package.decorInclusions.length ||
          furniture.length != package.furnitureInclusions.length)) {
    return 'This package has fixed inclusions.';
  }
  if (package.serviceOptions.isNotEmpty &&
      (!preparationServices(package).containsKey(serviceTier))) {
    return 'Choose an available catering service option.';
  }
  if (themeId != null &&
      (serviceTier == 'drop_off' ||
          !['buffet_setup', 'full_service'].contains(serviceTier) ||
          package.themeOptions
                  .where((theme) => theme['id'] == themeId)
                  .length !=
              1)) {
    return 'Choose a currently available package theme.';
  }
  return null;
}

/// Transient form snapshots, never a booking record. Only one account/package
/// context is retained; changing it clears all incompatible selections.
class PreparationDraftMemory {
  String? _scope;
  Map<String, dynamic>? _snapshot;
  Map<String, dynamic>? open(String owner, String provider, String package) {
    final scope = '$owner/$provider/$package';
    if (_scope != scope) {
      _scope = scope;
      _snapshot = null;
    }
    return _snapshot;
  }

  void save(
    String owner,
    String provider,
    String package,
    Map<String, dynamic> snapshot,
  ) {
    final scope = '$owner/$provider/$package';
    if (_scope == scope) _snapshot = Map.unmodifiable(snapshot);
  }

  void clear() {
    _scope = null;
    _snapshot = null;
  }
}

final preparationDraftMemory = PreparationDraftMemory();

EventCustomizationData snapshotCustomization(EventCustomizationData value) =>
    EventCustomizationData(
      eventType: value.eventType,
      eventDate: value.eventDate,
      eventTime: value.eventTime,
      eventEndTime: value.eventEndTime,
      guestCount: value.guestCount,
      eventLocation: value.eventLocation,
      eventAddress: value.eventAddress,
      selectedFoods: List.unmodifiable(value.selectedFoods),
      selectedDecorations: List.unmodifiable(value.selectedDecorations),
      selectedFurniture: List.unmodifiable(value.selectedFurniture),
      selectedAddOns: List.unmodifiable(
        value.selectedAddOns.map(
          (addon) => Map<String, dynamic>.unmodifiable(addon),
        ),
      ),
      willArrangeOwnAddOns: value.willArrangeOwnAddOns,
      customerArrangedAddOnsNote: value.customerArrangedAddOnsNote,
      specialRequest: value.specialRequest,
      serviceTier: value.serviceTier,
      packageThemeId: value.packageThemeId,
    );
