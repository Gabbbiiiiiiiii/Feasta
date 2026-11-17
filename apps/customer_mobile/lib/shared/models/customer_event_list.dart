import 'dart:convert';
import 'food_choice_v2.dart';

part 'customer_event_list_configuration.dart';

Never _invalid() => throw const FormatException('Invalid customer Event List.');

String eventListId(Object? value, {bool owner = false}) {
  if (value is! String ||
      !RegExp(
        owner ? r'^[A-Za-z0-9_-]{1,128}$' : r'^[A-Za-z0-9_-]{8,160}$',
      ).hasMatch(value)) {
    _invalid();
  }
  return value;
}

String _text(Object? value) {
  if (value is! String ||
      value.trim().isEmpty ||
      value.length > 200 ||
      RegExp(r'[\x00-\x1f\x7f]').hasMatch(value)) {
    _invalid();
  }
  return value;
}

void _keys(Map<String, dynamic> value, Set<String> allowed) {
  if (value.keys.any((key) => !allowed.contains(key))) _invalid();
}

/// Structured encodings reserve separate identity spaces for future entry kinds.
/// Package keys remain unchanged; marketplace services have a separate identity.
class EventListIdentity {
  EventListIdentity.package(String providerId, String packageId)
    : parts = List.unmodifiable([
        'package',
        eventListId(providerId),
        eventListId(packageId),
      ]);
  EventListIdentity.customMenu(String providerId, String menuItemId)
    : parts = List.unmodifiable([
        'custom_menu',
        eventListId(providerId),
        eventListId(menuItemId),
      ]);
  EventListIdentity.service(String source, String providerId, String serviceId)
    : parts = List.unmodifiable([
        'service',
        eventListId(source),
        eventListId(providerId),
        eventListId(serviceId),
      ]);
  EventListIdentity.marketplaceService(String providerId, String serviceId)
    : parts = List.unmodifiable([
        'marketplace_service',
        eventListId(providerId),
        eventListId(serviceId),
      ]);
  final List<String> parts;
  String get key => jsonEncode(parts);
}

/// Planning snapshot only. Prices and availability require fresh validation.
class CustomerEventListEntry {
  CustomerEventListEntry({
    required String providerId,
    required String packageId,
    required String packageName,
    required String providerName,
    this.estimatedPrice,
    this.imageUrl,
    this.configuration,
  }) : kind = 'catering_package',
       serviceId = null,
       expectedRevision = null,
       providerId = eventListId(providerId),
       packageId = eventListId(packageId),
       packageName = _text(packageName),
       providerName = _text(providerName) {
    _validateDisplay(estimatedPrice, imageUrl);
  }

  /// Standalone marketplace planning selection. estimatedPrice is display-only.
  /// packageId stays empty; packageName exposes the display name for old readers.
  CustomerEventListEntry.marketplaceService({
    required String providerId,
    required String serviceId,
    required String serviceName,
    required String providerName,
    this.expectedRevision,
    this.estimatedPrice,
    this.imageUrl,
    this.configuration,
  }) : kind = 'marketplace_service',
       providerId = eventListId(providerId),
       serviceId = eventListId(serviceId),
       packageId = '',
       packageName = _text(serviceName),
       providerName = _text(providerName) {
    if (expectedRevision != null &&
        (expectedRevision! < 1 || expectedRevision! > 9007199254740991)) {
      _invalid();
    }
    _validateDisplay(estimatedPrice, imageUrl);
  }
  static void _validateDisplay(double? estimatedPrice, String? imageUrl) {
    if (estimatedPrice != null &&
        (!estimatedPrice.isFinite || estimatedPrice < 0)) {
      _invalid();
    }
    if (imageUrl != null) {
      final uri = Uri.tryParse(imageUrl);
      if (imageUrl.length > 2048 ||
          uri == null ||
          uri.scheme != 'https' ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty ||
          uri.hasFragment ||
          RegExp(r'[\s\x00-\x1f\x7f]').hasMatch(imageUrl)) {
        _invalid();
      }
    }
  }

  final String kind;
  final String? serviceId;
  final int? expectedRevision;
  String? get serviceName => kind == 'marketplace_service' ? packageName : null;
  bool get hasMarketplaceSubmissionMetadata =>
      kind == 'marketplace_service' &&
      serviceId != null &&
      expectedRevision != null;

  /// A saved revision is never proof of current server authority.
  /// Callers must compare with fresh catalog metadata before mixed submission.
  bool matchesMarketplaceMetadata({
    required String currentProviderId,
    required String currentServiceId,
    required int currentRevision,
  }) =>
      hasMarketplaceSubmissionMetadata &&
      currentRevision > 0 &&
      providerId == currentProviderId &&
      serviceId == currentServiceId &&
      expectedRevision == currentRevision;

  final String providerId, packageId, packageName, providerName;
  final double? estimatedPrice;
  final String? imageUrl;
  final CustomerEventListConfiguration? configuration;

  /// Local planning state only. Booking and payment authority remain server-side.
  CustomerEventListReadiness get readiness =>
      kind == 'marketplace_service' && !hasMarketplaceSubmissionMetadata
      ? CustomerEventListReadiness.marketplaceMetadataRefreshRequired
      : configuration == null
      ? CustomerEventListReadiness.needsCustomization
      : CustomerEventListReadiness.configuredRevalidationRequired;
  EventListIdentity get identity => kind == 'marketplace_service'
      ? EventListIdentity.marketplaceService(providerId, serviceId!)
      : EventListIdentity.package(providerId, packageId);
  // Attached add-ons remain in configuration; standalone services use their own entry.
  List<EventListIdentity> get attachedServices => const [];
  Map<String, dynamic> toJson() => kind == 'marketplace_service'
      ? {
          'type': kind,
          'providerId': providerId,
          'serviceId': serviceId,
          'serviceName': serviceName,
          'expectedRevision': expectedRevision,
          'providerName': providerName,
          'estimatedPrice': estimatedPrice,
          'imageUrl': imageUrl,
          if (configuration != null) 'configuration': configuration!.toJson(),
        }
      : {
          'type': 'package',
          'providerId': providerId,
          'packageId': packageId,
          'packageName': packageName,
          'providerName': providerName,
          'estimatedPrice': estimatedPrice,
          'imageUrl': imageUrl,
          'attachedServices': <Object>[],
          if (configuration != null) 'configuration': configuration!.toJson(),
        };
  factory CustomerEventListEntry.fromJson(Map<String, dynamic> json) {
    if (json['type'] == 'marketplace_service') {
      _keys(json, {
        'type',
        'providerId',
        'serviceId',
        'serviceName',
        'expectedRevision',
        'providerName',
        'estimatedPrice',
        'imageUrl',
        'configuration',
      });
      final revision = json['expectedRevision'];
      final price = json['estimatedPrice'];
      if ((revision != null && revision is! int) ||
          (price != null && price is! num) ||
          (json['imageUrl'] != null && json['imageUrl'] is! String)) {
        _invalid();
      }
      return CustomerEventListEntry.marketplaceService(
        providerId: eventListId(json['providerId']),
        serviceId: eventListId(json['serviceId']),
        serviceName: _text(json['serviceName']),
        providerName: _text(json['providerName']),
        expectedRevision: revision as int?,
        estimatedPrice: (price as num?)?.toDouble(),
        imageUrl: json['imageUrl'] as String?,
        configuration: json.containsKey('configuration')
            ? CustomerEventListConfiguration.fromJson(
                _record(json['configuration']),
              )
            : null,
      );
    }
    _keys(json, {
      'type',
      'providerId',
      'packageId',
      'packageName',
      'providerName',
      'estimatedPrice',
      'imageUrl',
      'attachedServices',
      'configuration',
    });
    final services = json['attachedServices'];
    final price = json['estimatedPrice'];
    if (json['type'] != 'package' ||
        services is! List ||
        services.isNotEmpty ||
        (price != null && price is! num) ||
        (json['imageUrl'] != null && json['imageUrl'] is! String)) {
      _invalid();
    }
    return CustomerEventListEntry(
      providerId: eventListId(json['providerId']),
      packageId: eventListId(json['packageId']),
      packageName: _text(json['packageName']),
      providerName: _text(json['providerName']),
      estimatedPrice: (price as num?)?.toDouble(),
      imageUrl: json['imageUrl'] as String?,
      configuration: json.containsKey('configuration')
          ? CustomerEventListConfiguration.fromJson(
              _record(json['configuration']),
            )
          : null,
    );
  }
}

class CustomerEventList {
  CustomerEventList({
    required String ownerUid,
    required this.revision,
    required this.updatedAt,
    required List<CustomerEventListEntry> entries,
  }) : ownerUid = eventListId(ownerUid, owner: true),
       entries = List.unmodifiable(entries) {
    if (revision < 0 ||
        revision > 9007199254740991 ||
        !updatedAt.isUtc ||
        entries.length > maxEntries ||
        entries.map((e) => e.identity.key).toSet().length != entries.length) {
      _invalid();
    }
  }
  static const schemaVersion = 1;
  static const maxEntries = 24;
  static const maxRecordBytes = 100000;
  final String ownerUid;
  final int revision;
  final DateTime updatedAt;
  final List<CustomerEventListEntry> entries;
  String get currency => 'PHP';
  Map<String, dynamic> toJson() => {
    'version': schemaVersion,
    'ownerUid': ownerUid,
    'revision': revision,
    'updatedAt': updatedAt.toIso8601String(),
    'currency': currency,
    'entries': entries.map((e) => e.toJson()).toList(),
  };
  String encode() {
    final raw = jsonEncode(toJson());
    if (utf8.encode(raw).length > maxRecordBytes) _invalid();
    return raw;
  }

  factory CustomerEventList.decode(String raw, {required String ownerUid}) {
    eventListId(ownerUid, owner: true);
    if (raw.length > maxRecordBytes ||
        utf8.encode(raw).length > maxRecordBytes) {
      _invalid();
    }
    final json = jsonDecode(raw);
    if (json is! Map<String, dynamic>) _invalid();
    _keys(json, {
      'version',
      'ownerUid',
      'revision',
      'updatedAt',
      'currency',
      'entries',
    });
    final entries = json['entries'];
    final date = json['updatedAt'];
    if (json['version'] is! int ||
        json['version'] != schemaVersion ||
        json['ownerUid'] != ownerUid ||
        json['revision'] is! int ||
        json['currency'] != 'PHP' ||
        entries is! List ||
        entries.length > maxEntries ||
        date is! String ||
        date.length > 32) {
      _invalid();
    }
    final timestamp = DateTime.tryParse(date);
    if (timestamp == null ||
        !timestamp.isUtc ||
        timestamp.toIso8601String() != date) {
      _invalid();
    }
    return CustomerEventList(
      ownerUid: ownerUid,
      revision: json['revision'] as int,
      updatedAt: timestamp,
      entries: entries.map((dynamic entry) {
        if (entry is! Map<String, dynamic>) _invalid();
        return CustomerEventListEntry.fromJson(entry);
      }).toList(),
    );
  }
}
