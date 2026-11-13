part of 'customer_event_list.dart';

enum CustomerEventListReadiness {
  needsCustomization,
  configuredRevalidationRequired,
}

Map<String, dynamic> _record(Object? value) {
  if (value is! Map<String, dynamic>) _invalid();
  return value;
}

String _configurationText(Object? value, int limit, {bool empty = false}) {
  if (value is! String ||
      value.length > limit ||
      (!empty && value.trim().isEmpty) ||
      RegExp(r'[\x00-\x1f\x7f]').hasMatch(value.replaceAll('\n', ''))) {
    _invalid();
  }
  return value;
}

String _selectionId(Object? value, {int minimum = 1, int maximum = 128}) {
  if (value is! String ||
      !RegExp('^[A-Za-z0-9_-]{$minimum,$maximum}\$').hasMatch(value)) {
    _invalid();
  }
  return value;
}

double? _configurationMoney(Object? value) {
  if (value == null) return null;
  if (value is! num || !value.isFinite || value < 0 || value > 100000000) {
    _invalid();
  }
  return value.toDouble();
}

List<String> _configurationList(Object? value) {
  if (value is! List || value.length > 50) _invalid();
  final result = value.map((v) => _configurationText(v, 160)).toList();
  if (result.toSet().length != result.length) _invalid();
  return List.unmodifiable(result);
}

class CustomerEventListEvent {
  CustomerEventListEvent._(Map<String, dynamic> json)
    : eventType = _configurationText(json['eventType'], 120),
      eventDate = _configurationText(json['eventDate'], 10),
      eventTime = _configurationText(json['eventTime'], 5),
      eventEndTime = _configurationText(json['eventEndTime'], 5),
      guestCount = json['guestCount'] is int
          ? json['guestCount'] as int
          : _invalid(),
      eventLocation = _configurationText(json['eventLocation'], 180),
      eventAddress = _configurationText(json['eventAddress'], 500),
      specialRequest = _configurationText(
        json['specialRequest'],
        1000,
        empty: true,
      ) {
    _keys(json, {
      'eventType',
      'eventDate',
      'eventTime',
      'eventEndTime',
      'guestCount',
      'eventLocation',
      'eventAddress',
      'specialRequest',
    });
    final date = DateTime.tryParse(eventDate);
    final clock = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(eventDate) ||
        date == null ||
        date.toIso8601String().substring(0, 10) != eventDate ||
        !clock.hasMatch(eventTime) ||
        !clock.hasMatch(eventEndTime) ||
        eventEndTime.compareTo(eventTime) <= 0 ||
        guestCount < 1 ||
        guestCount > 10000) {
      _invalid();
    }
  }
  final String eventType, eventDate, eventTime, eventEndTime;
  final int guestCount;
  final String eventLocation, eventAddress, specialRequest;
  Map<String, dynamic> toJson() => {
    'eventType': eventType,
    'eventDate': eventDate,
    'eventTime': eventTime,
    'eventEndTime': eventEndTime,
    'guestCount': guestCount,
    'eventLocation': eventLocation,
    'eventAddress': eventAddress,
    'specialRequest': specialRequest,
  };
}

class CustomerEventListFoodChoice {
  CustomerEventListFoodChoice._(Map<String, dynamic> json)
    : groupId = json['groupId'] as String,
      optionIds = List.unmodifiable(json['optionIds'] as List<String>);
  final String groupId;
  final List<String> optionIds;
  Map<String, dynamic> toJson() => {'groupId': groupId, 'optionIds': optionIds};
}

/// Uses the existing Mobile AddonModel.toBookingMap identity fields.
class CustomerEventListAddOn {
  CustomerEventListAddOn._(Map<String, dynamic> json)
    : addonId = _selectionId(json['addonId']),
      providerId = _selectionId(json['providerId']),
      source = _configurationText(json['source'], 40),
      name = _configurationText(json['name'], 160),
      providerBusinessName = _configurationText(
        json['providerBusinessName'],
        160,
      ),
      providerType = _configurationText(json['providerType'], 120, empty: true),
      category = _configurationText(json['category'], 120, empty: true),
      price = _configurationMoney(json['price']) {
    _keys(json, {
      'addonId',
      'providerId',
      'source',
      'name',
      'providerBusinessName',
      'providerType',
      'category',
      'price',
    });
    if (!['catering_provider', 'feasta_addon_provider'].contains(source)) {
      _invalid();
    }
  }
  final String addonId,
      providerId,
      source,
      name,
      providerBusinessName,
      providerType,
      category;
  final double? price;
  Map<String, dynamic> toJson() => {
    'addonId': addonId,
    'providerId': providerId,
    'source': source,
    'name': name,
    'providerBusinessName': providerBusinessName,
    'providerType': providerType,
    'category': category,
    'price': price,
  };
}

class CustomerEventListPricingContext {
  CustomerEventListPricingContext._(Map<String, dynamic> json)
    : pricingModel = json['pricingModel'] as String?,
      displayedServicePrice = _configurationMoney(
        json['displayedServicePrice'],
      ) {
    _keys(json, {'currency', 'pricingModel', 'displayedServicePrice'});
    if (json['currency'] != 'PHP' ||
        ![null, 'per_pax', 'per_bundle'].contains(pricingModel)) {
      _invalid();
    }
  }
  final String? pricingModel;
  final double? displayedServicePrice;
  Map<String, dynamic> toJson() => {
    'currency': 'PHP',
    'pricingModel': pricingModel,
    'displayedServicePrice': displayedServicePrice,
  };
}

/// Immutable planning snapshot. No tokens, credentials, consent, or server prices.
/// Creation and decoding share the same strict validation boundary.
class CustomerEventListConfiguration {
  CustomerEventListConfiguration._(Map<String, dynamic> json)
    : event = CustomerEventListEvent._(_record(json['event'])),
      sharedContractVersion = json['sharedContractVersion'] as int?,
      expectedPackageRevision = json['expectedPackageRevision'] as int?,
      serviceTier = json['serviceTier'] as String?,
      packageThemeId = json['packageThemeId'] == null
          ? null
          : _selectionId(json['packageThemeId'], minimum: 2, maximum: 80),
      themeChoice = json['themeChoice'] as String?,
      customTheme = _configurationText(json['customTheme'], 10000, empty: true),
      selectedFoods = _configurationList(json['selectedFoods']),
      selectedDecorations = _configurationList(json['selectedDecorations']),
      selectedFurniture = _configurationList(json['selectedFurniture']),
      foodChoiceSelections = List.unmodifiable(
        parseFoodChoiceSelections(
          json['foodChoiceSelections'],
        ).map(CustomerEventListFoodChoice._),
      ),
      selectedAddOns = _parseAddOns(json['selectedAddOns']),
      willArrangeOwnAddOns = json['willArrangeOwnAddOns'] as bool,
      customerArrangedAddOnsNote = _configurationText(
        json['customerArrangedAddOnsNote'],
        1000,
        empty: true,
      ),
      estimatedTotal = _configurationMoney(json['estimatedTotal']),
      pricingContext = json['pricingContext'] == null
          ? null
          : CustomerEventListPricingContext._(_record(json['pricingContext'])) {
    _keys(json, {
      'event',
      'sharedContractVersion',
      'expectedPackageRevision',
      'serviceTier',
      'packageThemeId',
      'themeChoice',
      'customTheme',
      'selectedFoods',
      'selectedDecorations',
      'selectedFurniture',
      'foodChoiceSelections',
      'selectedAddOns',
      'willArrangeOwnAddOns',
      'customerArrangedAddOnsNote',
      'estimatedTotal',
      'pricingContext',
    });
    if ((sharedContractVersion != null && sharedContractVersion != 2) ||
        (expectedPackageRevision != null &&
            (expectedPackageRevision! < 1 ||
                expectedPackageRevision! > 9007199254740991)) ||
        (sharedContractVersion == 2 &&
            (expectedPackageRevision == null ||
                json['foodChoiceSelections'] is! List)) ||
        (sharedContractVersion != 2 && foodChoiceSelections.isNotEmpty) ||
        ![
          null,
          'drop_off',
          'buffet_setup',
          'full_service',
        ].contains(serviceTier) ||
        ![null, 'custom', 'none', 'package'].contains(themeChoice)) {
      _invalid();
    }
  }
  factory CustomerEventListConfiguration.fromJson(Map<String, dynamic> json) {
    for (final key in [
      'event',
      'customTheme',
      'selectedFoods',
      'selectedDecorations',
      'selectedFurniture',
      'foodChoiceSelections',
      'selectedAddOns',
      'willArrangeOwnAddOns',
      'customerArrangedAddOnsNote',
      'estimatedTotal',
    ]) {
      if (!json.containsKey(key)) _invalid();
    }
    if (json['foodChoiceSelections'] is! List) _invalid();
    try {
      final result = CustomerEventListConfiguration._(json);
      if (result.foodChoiceSelections.any((v) => v.optionIds.isEmpty)) {
        _invalid();
      }
      return result;
    } on TypeError {
      _invalid();
    }
  }
  static List<CustomerEventListAddOn> _parseAddOns(Object? value) {
    if (value is! List || value.length > 20) _invalid();
    final result = value
        .map((v) => CustomerEventListAddOn._(_record(v)))
        .toList();
    if (result.map((v) => v.addonId).toSet().length != result.length) {
      _invalid();
    }
    return List.unmodifiable(result);
  }

  final CustomerEventListEvent event;
  final int? sharedContractVersion, expectedPackageRevision;
  final String? serviceTier, packageThemeId, themeChoice;
  final String customTheme;
  final List<String> selectedFoods, selectedDecorations, selectedFurniture;
  final List<CustomerEventListFoodChoice> foodChoiceSelections;
  final List<CustomerEventListAddOn> selectedAddOns;
  final bool willArrangeOwnAddOns;
  final String customerArrangedAddOnsNote;
  final double? estimatedTotal;
  final CustomerEventListPricingContext? pricingContext;
  Map<String, dynamic> toJson() => {
    'event': event.toJson(),
    'sharedContractVersion': sharedContractVersion,
    'expectedPackageRevision': expectedPackageRevision,
    'serviceTier': serviceTier,
    'packageThemeId': packageThemeId,
    'themeChoice': themeChoice,
    'customTheme': customTheme,
    'selectedFoods': selectedFoods,
    'selectedDecorations': selectedDecorations,
    'selectedFurniture': selectedFurniture,
    'foodChoiceSelections': foodChoiceSelections
        .map((v) => v.toJson())
        .toList(),
    'selectedAddOns': selectedAddOns.map((v) => v.toJson()).toList(),
    'willArrangeOwnAddOns': willArrangeOwnAddOns,
    'customerArrangedAddOnsNote': customerArrangedAddOnsNote,
    'estimatedTotal': estimatedTotal,
    'pricingContext': pricingContext?.toJson(),
  };
}
