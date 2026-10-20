import 'dart:convert';

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
/// Only packages are accepted by the v1 entry codec and mutation API.
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
  }) : providerId = eventListId(providerId),
       packageId = eventListId(packageId),
       packageName = _text(packageName),
       providerName = _text(providerName) {
    if (estimatedPrice != null &&
        (!estimatedPrice!.isFinite || estimatedPrice! < 0)) {
      _invalid();
    }
    if (imageUrl != null) {
      final uri = Uri.tryParse(imageUrl!);
      if (imageUrl!.length > 2048 ||
          uri == null ||
          uri.scheme != 'https' ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty ||
          uri.hasFragment ||
          RegExp(r'[\s\x00-\x1f\x7f]').hasMatch(imageUrl!)) {
        _invalid();
      }
    }
  }
  final String providerId, packageId, packageName, providerName;
  final double? estimatedPrice;
  final String? imageUrl;
  EventListIdentity get identity =>
      EventListIdentity.package(providerId, packageId);
  // Reserved for future attached references; v1 does not accept services.
  List<EventListIdentity> get attachedServices => const [];
  Map<String, dynamic> toJson() => {
    'type': 'package',
    'providerId': providerId,
    'packageId': packageId,
    'packageName': packageName,
    'providerName': providerName,
    'estimatedPrice': estimatedPrice,
    'imageUrl': imageUrl,
    'attachedServices': <Object>[],
  };
  factory CustomerEventListEntry.fromJson(Map<String, dynamic> json) {
    _keys(json, {
      'type',
      'providerId',
      'packageId',
      'packageName',
      'providerName',
      'estimatedPrice',
      'imageUrl',
      'attachedServices',
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
  String encode() => jsonEncode(toJson());
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
