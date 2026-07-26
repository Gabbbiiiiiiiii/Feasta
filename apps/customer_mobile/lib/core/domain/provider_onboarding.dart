import '../enums/domain_enum_serializers.dart';
import '../enums/domain_enums.dart';

const requiredProviderVerificationDocumentTypes = {
  VerificationDocumentType.businessPermit,
  VerificationDocumentType.validId,
};

const providerServiceCategories = {
  'catering_service',
  'food_trays_packed_meals',
  'catering_event_styling',
  'photographer',
  'videographer',
  'photo_booth',
  'event_coordinator',
  'event_host_emcee',
  'sound_system',
  'lights_and_sounds',
  'singer_band',
  'dancer_performer',
  'decorator_event_stylist',
  'florist',
  'cake_provider',
  'gown_suit_rental',
  'car_rental',
  'venue_provider',
  'tables_chairs_rental',
  'other_event_service',
};

const cateringServiceCategories = {
  'catering_service',
  'food_trays_packed_meals',
  'catering_event_styling',
};

const providerEventTypes = {
  'birthday',
  'wedding',
  'anniversary',
  'reunion',
  'corporate',
  'baptism',
  'graduation',
  'other',
};

const providerOperatingDays = {
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
};

class ProviderVerificationDocumentDefinition {
  const ProviderVerificationDocumentDefinition({
    required this.type,
    required this.label,
    required this.isRequired,
  });

  final VerificationDocumentType type;
  final String label;
  final bool isRequired;
}

const providerVerificationDocumentDefinitions = [
  ProviderVerificationDocumentDefinition(
    type: VerificationDocumentType.businessPermit,
    label: 'Business permit',
    isRequired: true,
  ),
  ProviderVerificationDocumentDefinition(
    type: VerificationDocumentType.dtiRegistration,
    label: 'DTI registration',
    isRequired: false,
  ),
  ProviderVerificationDocumentDefinition(
    type: VerificationDocumentType.birRegistration,
    label: 'BIR registration',
    isRequired: false,
  ),
  ProviderVerificationDocumentDefinition(
    type: VerificationDocumentType.validId,
    label: 'Valid ID',
    isRequired: true,
  ),
  ProviderVerificationDocumentDefinition(
    type: VerificationDocumentType.sanitaryPermit,
    label: 'Sanitary permit',
    isRequired: false,
  ),
  ProviderVerificationDocumentDefinition(
    type: VerificationDocumentType.mayorsPermit,
    label: "Mayor's permit",
    isRequired: false,
  ),
  ProviderVerificationDocumentDefinition(
    type: VerificationDocumentType.other,
    label: 'Other',
    isRequired: false,
  ),
];

const providerOnboardingClientFields = {
  'ownerFirstName',
  'ownerLastName',
  'businessName',
  'businessEmail',
  'businessPhone',
  'description',
  'address',
  'city',
  'province',
  'locationCoordinates',
  'providerServiceType',
  'providerCategory',
  'serviceCategories',
  'serviceAreas',
  'maxServiceDistanceKm',
  'eventTypesSupported',
  'minGuestsPerEvent',
  'maxGuestsPerEvent',
  'guestCapacity',
  'acceptsMultipleEventsPerDay',
  'maxEventsPerDay',
  'availableStaffCount',
  'availableEquipmentCount',
  'operatingDays',
  'bookingLeadTimeDays',
  'unavailableDates',
  'idempotencyKey',
};

const providerServerOwnedFields = {
  'ownerId',
  'ownerEmail',
  'ownerPhone',
  'verificationStatus',
  'isActive',
  'isFeatured',
  'isSuspended',
  'approvedAt',
  'approvedBy',
  'reviewedAt',
  'reviewedBy',
  'rejectionReason',
  'resubmissionReason',
  'suspensionReason',
  'searchTokens',
  'createdAt',
  'updatedAt',
};

class ProviderLocationCoordinates {
  const ProviderLocationCoordinates({
    required this.latitude,
    required this.longitude,
  });

  final double latitude;
  final double longitude;
}

class ProviderOwnerProfile {
  const ProviderOwnerProfile({
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phone,
    required this.termsPolicyVersion,
    required this.privacyPolicyVersion,
    required this.termsAcceptedAt,
    required this.privacyAcceptedAt,
  });

  final String firstName;
  final String lastName;
  final String? email;
  final String? phone;
  final String termsPolicyVersion;
  final String privacyPolicyVersion;
  final DateTime? termsAcceptedAt;
  final DateTime? privacyAcceptedAt;
}

class ProviderOnboardingInput {
  const ProviderOnboardingInput({
    required this.ownerFirstName,
    required this.ownerLastName,
    required this.businessName,
    required this.businessEmail,
    required this.businessPhone,
    required this.description,
    required this.providerServiceType,
    required this.providerCategory,
    required this.serviceCategories,
    required this.address,
    required this.city,
    required this.province,
    required this.locationCoordinates,
    required this.serviceAreas,
    required this.maxServiceDistanceKm,
    required this.eventTypesSupported,
    required this.minGuestsPerEvent,
    required this.maxGuestsPerEvent,
    required this.acceptsMultipleEventsPerDay,
    required this.maxEventsPerDay,
    required this.availableStaffCount,
    required this.availableEquipmentCount,
    required this.operatingDays,
    required this.bookingLeadTimeDays,
    required this.unavailableDates,
  });

  final String ownerFirstName;
  final String ownerLastName;
  final String businessName;
  final String businessEmail;
  final String businessPhone;
  final String description;
  final ProviderServiceType providerServiceType;
  final String providerCategory;
  final List<String> serviceCategories;
  final String address;
  final String city;
  final String province;
  final ProviderLocationCoordinates? locationCoordinates;
  final List<String> serviceAreas;
  final double? maxServiceDistanceKm;
  final List<String> eventTypesSupported;
  final int minGuestsPerEvent;
  final int maxGuestsPerEvent;
  final bool acceptsMultipleEventsPerDay;
  final int maxEventsPerDay;
  final int availableStaffCount;
  final int availableEquipmentCount;
  final List<String> operatingDays;
  final int bookingLeadTimeDays;
  final List<String> unavailableDates;
}

class ProviderVerificationRecord {
  const ProviderVerificationRecord({
    required this.id,
    required this.providerId,
    required this.ownerId,
    required this.businessName,
    required this.providerServiceType,
    required this.status,
    required this.remarks,
    required this.rejectionReason,
    required this.resubmissionReason,
    required this.suspensionReason,
    required this.submittedAt,
    required this.reviewedAt,
    required this.reviewedBy,
    required this.approvedAt,
    required this.rejectedAt,
    required this.suspendedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String providerId;
  final String ownerId;
  final String businessName;
  final ProviderServiceType providerServiceType;
  final ProviderVerificationStatus status;
  final String? remarks;
  final String? rejectionReason;
  final String? resubmissionReason;
  final String? suspensionReason;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final String? reviewedBy;
  final DateTime? approvedAt;
  final DateTime? rejectedAt;
  final DateTime? suspendedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

class ProviderVerificationDocumentRecord {
  const ProviderVerificationDocumentRecord({
    required this.id,
    required this.verificationId,
    required this.providerId,
    required this.ownerId,
    required this.documentType,
    required this.displayName,
    required this.isRequired,
    required this.storagePath,
    required this.originalFileName,
    required this.contentType,
    required this.fileSize,
    required this.status,
    required this.rejectionReason,
    required this.verifiedAt,
    required this.verifiedBy,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String verificationId;
  final String providerId;
  final String ownerId;
  final VerificationDocumentType documentType;
  final String displayName;
  final bool isRequired;
  final String storagePath;
  final String originalFileName;
  final String contentType;
  final int fileSize;
  final VerificationDocumentStatus status;
  final String? rejectionReason;
  final DateTime? verifiedAt;
  final String? verifiedBy;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

class ProviderVerificationHistoryEntry {
  const ProviderVerificationHistoryEntry({
    required this.actorId,
    required this.actorRole,
    required this.action,
    required this.fromStatus,
    required this.toStatus,
    required this.remarks,
    required this.createdAt,
  });

  final String actorId;
  final UserRole actorRole;
  final String action;
  final ProviderVerificationStatus? fromStatus;
  final ProviderVerificationStatus toStatus;
  final String? remarks;
  final DateTime? createdAt;
}

class ProviderValidationIssue {
  const ProviderValidationIssue(this.field, this.code);

  final String field;
  final String code;
}

class ProviderOnboardingValidationResult {
  const ProviderOnboardingValidationResult.valid(this.value)
    : issues = const [];

  const ProviderOnboardingValidationResult.invalid(this.issues) : value = null;

  final ProviderOnboardingInput? value;
  final List<ProviderValidationIssue> issues;

  bool get isValid => value != null && issues.isEmpty;
}

ProviderOnboardingValidationResult validateProviderOnboardingInput(
  Map<String, Object?> input,
) {
  final issues = <ProviderValidationIssue>[];

  String text(String field, int minimum, int maximum) {
    final raw = input[field];
    if (raw is! String) {
      issues.add(ProviderValidationIssue(field, 'required'));
      return '';
    }
    final value = raw.trim();
    if (value.length < minimum) {
      issues.add(ProviderValidationIssue(field, 'too_short'));
    }
    if (value.length > maximum) {
      issues.add(ProviderValidationIssue(field, 'too_long'));
    }
    return value;
  }

  final ownerFirstName = text('ownerFirstName', 1, 80);
  final ownerLastName = text('ownerLastName', 1, 80);
  final businessName = text('businessName', 2, 120);
  final businessEmail = text('businessEmail', 3, 160).toLowerCase();
  if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(businessEmail)) {
    issues.add(const ProviderValidationIssue('businessEmail', 'invalid'));
  }
  final businessPhone = text('businessPhone', 7, 30);
  final description = text('description', 20, 2000);
  final providerCategory = text('providerCategory', 2, 100);
  final address = text('address', 3, 250);
  final city = text('city', 2, 100);
  final province = text('province', 2, 100);
  final serviceType = tryParseProviderServiceType(input['providerServiceType']);
  if (serviceType == null) {
    issues.add(const ProviderValidationIssue('providerServiceType', 'invalid'));
  }

  final coordinates = _coordinates(input['locationCoordinates'], issues);
  final serviceAreas = _stringList(
    input['serviceAreas'],
    'serviceAreas',
    issues,
  );
  final serviceCategories = _enumList(
    input['serviceCategories'],
    'serviceCategories',
    providerServiceCategories,
    issues,
  );
  if (serviceType != null &&
      serviceCategories.any(
        (category) => !_serviceCategoryMatches(category, serviceType),
      )) {
    issues.add(const ProviderValidationIssue('serviceCategories', 'invalid'));
  }
  final maxServiceDistanceKm = _optionalNumber(
    input['maxServiceDistanceKm'],
    'maxServiceDistanceKm',
    minimum: 1,
    maximum: 1000,
    issues: issues,
  );
  final eventTypes = input['serviceCategories'] == null
      ? _legacyEventTypes(
          input['eventTypesSupported'],
          'eventTypesSupported',
          issues,
        )
      : _enumList(
          input['eventTypesSupported'],
          'eventTypesSupported',
          providerEventTypes,
          issues,
        );
  final minGuests = _integer(
    input['minGuestsPerEvent'],
    'minGuestsPerEvent',
    minimum: 0,
    maximum: 100000,
    fallback: 0,
    issues: issues,
  );
  final maxGuests = _integer(
    input['maxGuestsPerEvent'] ?? input['guestCapacity'],
    'maxGuestsPerEvent',
    minimum: 0,
    maximum: 100000,
    fallback: 0,
    issues: issues,
  );
  final acceptsMultiple = _boolean(
    input['acceptsMultipleEventsPerDay'],
    'acceptsMultipleEventsPerDay',
    false,
    issues,
  );
  final maxEvents = _integer(
    input['maxEventsPerDay'],
    'maxEventsPerDay',
    minimum: 1,
    maximum: 100,
    fallback: 1,
    issues: issues,
  );
  final staff = _integer(
    input['availableStaffCount'],
    'availableStaffCount',
    minimum: 0,
    maximum: 100000,
    fallback: 0,
    issues: issues,
  );
  final equipment = _integer(
    input['availableEquipmentCount'],
    'availableEquipmentCount',
    minimum: 0,
    maximum: 100000,
    fallback: 0,
    issues: issues,
  );
  final operatingDays = _enumList(
    input['operatingDays'],
    'operatingDays',
    providerOperatingDays,
    issues,
  );
  final bookingLeadTimeDays = _integer(
    input['bookingLeadTimeDays'],
    'bookingLeadTimeDays',
    minimum: 0,
    maximum: 365,
    fallback: 0,
    issues: issues,
  );
  final unavailableDates = _dateList(
    input['unavailableDates'],
    'unavailableDates',
    issues,
  );
  if (maxGuests > 0 && minGuests > maxGuests) {
    issues.add(const ProviderValidationIssue('minGuestsPerEvent', 'invalid'));
  }
  if (!acceptsMultiple && maxEvents != 1) {
    issues.add(const ProviderValidationIssue('maxEventsPerDay', 'invalid'));
  }

  for (final field in input.keys) {
    if (!providerOnboardingClientFields.contains(field)) {
      issues.add(ProviderValidationIssue(field, 'unknown'));
    }
  }
  if (issues.isNotEmpty || serviceType == null) {
    return ProviderOnboardingValidationResult.invalid(issues);
  }

  return ProviderOnboardingValidationResult.valid(
    ProviderOnboardingInput(
      ownerFirstName: ownerFirstName,
      ownerLastName: ownerLastName,
      businessName: businessName,
      businessEmail: businessEmail,
      businessPhone: businessPhone,
      description: description,
      providerServiceType: serviceType,
      providerCategory: providerCategory,
      serviceCategories: serviceCategories,
      address: address,
      city: city,
      province: province,
      locationCoordinates: coordinates,
      serviceAreas: serviceAreas,
      maxServiceDistanceKm: maxServiceDistanceKm,
      eventTypesSupported: eventTypes,
      minGuestsPerEvent: minGuests,
      maxGuestsPerEvent: maxGuests,
      acceptsMultipleEventsPerDay: acceptsMultiple,
      maxEventsPerDay: maxEvents,
      availableStaffCount: staff,
      availableEquipmentCount: equipment,
      operatingDays: operatingDays,
      bookingLeadTimeDays: bookingLeadTimeDays,
      unavailableDates: unavailableDates,
    ),
  );
}

ProviderLocationCoordinates? _coordinates(
  Object? value,
  List<ProviderValidationIssue> issues,
) {
  if (value == null) return null;
  if (value is! Map) {
    issues.add(const ProviderValidationIssue('locationCoordinates', 'invalid'));
    return null;
  }
  final latitude = value['latitude'];
  final longitude = value['longitude'];
  if (latitude is! num ||
      longitude is! num ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180) {
    issues.add(const ProviderValidationIssue('locationCoordinates', 'invalid'));
    return null;
  }
  return ProviderLocationCoordinates(
    latitude: latitude.toDouble(),
    longitude: longitude.toDouble(),
  );
}

List<String> _stringList(
  Object? value,
  String field,
  List<ProviderValidationIssue> issues,
) {
  if (value == null) return [];
  if (value is! List ||
      value.length > 50 ||
      value.any(
        (item) =>
            item is! String || item.trim().isEmpty || item.trim().length > 100,
      )) {
    issues.add(ProviderValidationIssue(field, 'invalid'));
    return [];
  }
  return value.cast<String>().map((item) => item.trim()).toSet().toList();
}

List<String> _enumList(
  Object? value,
  String field,
  Set<String> allowed,
  List<ProviderValidationIssue> issues,
) {
  final values = _stringList(value, field, issues);
  if (values.any((item) => !allowed.contains(item))) {
    issues.add(ProviderValidationIssue(field, 'invalid'));
    return [];
  }
  return values;
}

List<String> _legacyEventTypes(
  Object? value,
  String field,
  List<ProviderValidationIssue> issues,
) {
  final values = _stringList(value, field, issues)
      .map((item) => item.toLowerCase().replaceAll(RegExp(r'[\s-]+'), '_'))
      .toSet()
      .toList();
  if (values.any((item) => !providerEventTypes.contains(item))) {
    issues.add(ProviderValidationIssue(field, 'invalid'));
    return [];
  }
  return values;
}

bool _serviceCategoryMatches(String category, ProviderServiceType serviceType) {
  final isCatering = cateringServiceCategories.contains(category);
  return serviceType == ProviderServiceType.both ||
      (serviceType == ProviderServiceType.catering ? isCatering : !isCatering);
}

double? _optionalNumber(
  Object? value,
  String field, {
  required double minimum,
  required double maximum,
  required List<ProviderValidationIssue> issues,
}) {
  if (value == null) return null;
  if (value is! num || !value.isFinite || value < minimum || value > maximum) {
    issues.add(ProviderValidationIssue(field, 'invalid'));
    return null;
  }
  return value.toDouble();
}

List<String> _dateList(
  Object? value,
  String field,
  List<ProviderValidationIssue> issues,
) {
  if (value == null) return [];
  if (value is! List ||
      value.length > 366 ||
      value.any(
        (date) =>
            date is! String ||
            !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date) ||
            DateTime.tryParse(date) == null,
      )) {
    issues.add(ProviderValidationIssue(field, 'invalid'));
    return [];
  }
  final values = value.cast<String>().toSet().toList();
  return values..sort();
}

int _integer(
  Object? value,
  String field, {
  required int minimum,
  required int maximum,
  required int fallback,
  required List<ProviderValidationIssue> issues,
}) {
  if (value == null) return fallback;
  if (value is! int || value < minimum || value > maximum) {
    issues.add(ProviderValidationIssue(field, 'invalid'));
    return fallback;
  }
  return value;
}

bool _boolean(
  Object? value,
  String field,
  bool fallback,
  List<ProviderValidationIssue> issues,
) {
  if (value == null) return fallback;
  if (value is! bool) {
    issues.add(ProviderValidationIssue(field, 'invalid'));
    return fallback;
  }
  return value;
}
