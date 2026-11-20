// Canonical cloud codec and conservative Mobile editing projection.
import 'dart:convert';
import 'customer_event_list.dart';
import 'customer_event_list_cloud_schema.dart';

Never _bad() =>
    throw const FormatException('Invalid customer Event List cloud contract');
final _schema =
    jsonDecode(customerEventListCloudSchemaJson) as Map<String, dynamic>;
const cloudEventListMaxBytes = 100000;
String cloudPlanningReadiness(Map<String, dynamic> entry) {
  if (entry['kind'] == 'custom_menu') return 'unsupported_requires_review';
  if (entry['kind'] == 'marketplace_service' &&
      entry['expectedRevision'] == null) {
    return 'marketplace_metadata_refresh_required';
  }
  return entry['configuration'] == null
      ? 'needs_customization'
      : 'configured_revalidation_required';
}

// JSON.stringify emits integral doubles as integers. Normalize before byte
// limits and encoding so native double prices have the same wire footprint.
Object? _wire(Object? v) {
  if (v is num && v.isFinite && v == v.truncateToDouble()) return v.toInt();
  if (v is List) return v.map(_wire).toList();
  if (v is Map<String, dynamic>) {
    return v.map((k, value) => MapEntry(k, _wire(value)));
  }
  return v;
}

String _stable(Object? v) {
  if (v is List) return '[${v.map(_stable).join(',')}]';
  if (v is Map) {
    final keys = v.keys.cast<String>().toList()..sort();
    return '{${keys.map((k) => '${jsonEncode(k)}:${_stable(v[k])}').join(',')}}';
  }
  return jsonEncode(v);
}

Map<String, dynamic> _copy(Map<String, dynamic> v) =>
    jsonDecode(jsonEncode(_wire(v))) as Map<String, dynamic>;
void _validate(Object? v, Map<String, dynamic> s) {
  if (v == null && s['nullable'] == true) return;
  switch (s['type']) {
    case 'enum':
      if (!(s['values'] as List).contains(v)) _bad();
    case 'object':
      if (v is! Map<String, dynamic>) _bad();
      final fields = s['fields'] as Map<String, dynamic>;
      if (v.keys.any((k) => !fields.containsKey(k)) ||
          (s['required'] as List).any((k) => !v.containsKey(k))) {
        _bad();
      }
      for (final key in v.keys) {
        _validate(v[key], fields[key] as Map<String, dynamic>);
      }
    case 'array':
      if (v is! List ||
          v.length > (s['max'] as int) ||
          v.length < ((s['min'] as int?) ?? 0)) {
        _bad();
      }
      for (final item in v) {
        _validate(item, s['items'] as Map<String, dynamic>);
      }
      if (s['unique'] == true && v.map(_stable).toSet().length != v.length) {
        _bad();
      }
    case 'string':
      if (v is! String ||
          v.length > (s['max'] as int) ||
          v.length < (s['min'] as int) ||
          RegExp(r'[\x00-\x09\x0b-\x1f\x7f]').hasMatch(v)) {
        _bad();
      }
      if (s['pattern'] != null &&
          RegExp(s['pattern'] as String).stringMatch(v) != v) {
        _bad();
      }
      if (s['format'] == 'time' &&
          !RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(v)) {
        _bad();
      }
      if (s['format'] == 'date') {
        final date = DateTime.tryParse(v);
        if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v) ||
            date == null ||
            date.toIso8601String().substring(0, 10) != v) {
          _bad();
        }
      }
    case 'boolean':
      if (v is! bool) _bad();
    case 'integer':
      if (v is! num ||
          !v.isFinite ||
          v != v.truncateToDouble() ||
          v < (s['min'] as num) ||
          v > (s['max'] as num)) {
        _bad();
      }
    case 'number':
      if (v is! num ||
          !v.isFinite ||
          v < (s['min'] as num) ||
          v > (s['max'] as num)) {
        _bad();
      }
    default:
      _bad();
  }
}

String cloudEntryIdentity(Map<String, dynamic> e) => [
  e['kind'],
  e['providerId'],
  e['selectionId'],
  if (e['variantId'] != null) e['variantId'],
].join(':');
void _unique(Object? rows, String Function(Map<String, dynamic>) key) {
  if (rows is! List) return;
  if (rows.map((r) => key(r as Map<String, dynamic>)).toSet().length !=
      rows.length) {
    _bad();
  }
}

void _event(Object? value) {
  if (value == null) return;
  final e = value as Map<String, dynamic>;
  if (e['eventEndTime'] != null &&
      (e['eventEndTime'] as String).compareTo(e['eventTime'] as String) <= 0) {
    _bad();
  }
}

/// Preserves the full canonical envelope even when the native model cannot edit it.
class CloudCustomerEventList {
  CloudCustomerEventList._(this._value);
  final Map<String, dynamic> _value;
  Map<String, dynamic> toJson() => _copy(_value);
  String encode() => jsonEncode(_value);
  factory CloudCustomerEventList.decode(
    String raw, {
    required String ownerUid,
  }) {
    if (utf8.encode(raw).length > cloudEventListMaxBytes) _bad();
    return CloudCustomerEventList.fromJson(jsonDecode(raw), ownerUid: ownerUid);
  }
  factory CloudCustomerEventList.fromJson(
    Object? value, {
    required String ownerUid,
  }) {
    _validate(value, _schema);
    final doc = value as Map<String, dynamic>;
    if (doc['ownerUid'] != ownerUid ||
        utf8.encode(jsonEncode(_wire(doc))).length > cloudEventListMaxBytes) {
      _bad();
    }
    _unique(doc['entries'], (e) => e['identity'] as String);
    _event(doc['schedule']);
    for (final row in doc['entries'] as List) {
      final e = row as Map<String, dynamic>;
      if (utf8.encode(jsonEncode(_wire(e))).length > 24000 ||
          e['identity'] != cloudEntryIdentity(e)) {
        _bad();
      }
      final menu = e['menu'];
      if ((e['kind'] == 'custom_menu') !=
              (e['variantId'] != null && menu != null) ||
          (e['kind'] != 'custom_menu' &&
              (e['variantId'] != null || menu != null))) {
        _bad();
      }
      if (e['kind'] == 'custom_menu' &&
          (e['configuration'] != null ||
              menu['servingMinimumGuests'] > menu['servingMaximumGuests'])) {
        _bad();
      }
      if (e['imageUrl'] != null &&
          !RegExp(
            r'^https://[^\s/#@:]+(?::\d+)?(?:/[^\s#]*)?$',
          ).hasMatch(e['imageUrl'] as String)) {
        _bad();
      }
      if (e['href'] != null &&
          (!(e['href'] as String).startsWith('/customer/') ||
              RegExp(r'[\\\r\n]').hasMatch(e['href'] as String))) {
        _bad();
      }
      final c = e['configuration'] as Map<String, dynamic>?;
      if (c != null) {
        _event(c['event']);
        if (c['sharedContractVersion'] == 2 &&
            (c['expectedPackageRevision'] == null ||
                c['foodChoiceSelections'] is! List)) {
          _bad();
        }
        if (c['sharedContractVersion'] != 2 &&
            c['foodChoiceSelections'] is List &&
            (c['foodChoiceSelections'] as List).isNotEmpty) {
          _bad();
        }
        _unique(c['foodChoiceSelections'], (r) => r['groupId'] as String);
        _unique(
          c['selectedEventServices'],
          (r) => '${r['source'] ?? ''}:${r['providerId']}:${r['id']}',
        );
        _unique(
          c['selectedAddOns'],
          (r) => '${r['source']}:${r['providerId']}:${r['addonId']}',
        );
      }
    }
    return CloudCustomerEventList._(_copy(doc));
  }
  factory CloudCustomerEventList.fromLocal(CustomerEventList local) {
    final entries = local.entries.map((e) {
      final entry = <String, dynamic>{
        'kind': e.kind,
        'providerId': e.providerId,
        'selectionId': e.serviceId ?? e.packageId,
        'variantId': null,
        'providerName': e.providerName,
        'name': e.packageName,
        'estimatedPrice': e.estimatedPrice,
        'imageUrl': e.imageUrl,
        'expectedRevision':
            e.expectedRevision ?? e.configuration?.expectedPackageRevision,
        'configuration': e.configuration?.toJson(),
        'href': null,
        'menu': null,
      };
      entry['identity'] = cloudEntryIdentity(entry);
      return entry;
    }).toList();
    return CloudCustomerEventList.fromJson({
      'version': 1,
      'ownerUid': local.ownerUid,
      'revision': 0,
      'currency': 'PHP',
      'entries': entries,
      'schedule': null,
      'migration': {'version': 1, 'completed': true},
    }, ownerUid: local.ownerUid);
  }
}

/// Read-only results retain the canonical entry; never manufacture a bookable model.
class CloudMobileProjection {
  CloudMobileProjection(this.preserved, this.entry);
  final Map<String, dynamic> preserved;
  final CustomerEventListEntry? entry;
  bool get readOnly => entry == null;
}

CloudMobileProjection projectCloudEntryToMobile(Map<String, dynamic> entry) {
  final doc = CloudCustomerEventList.fromJson({
    'version': 1,
    'ownerUid': 'projection',
    'revision': 0,
    'currency': 'PHP',
    'entries': [entry],
    'schedule': null,
    'migration': {'version': 1, 'completed': true},
  }, ownerUid: 'projection');
  final e = (doc.toJson()['entries'] as List).single as Map<String, dynamic>;
  final c = e['configuration'] as Map<String, dynamic>?;
  if (e['kind'] == 'custom_menu' ||
      (c != null &&
          e['kind'] == 'catering_package' &&
          e['expectedRevision'] != c['expectedPackageRevision']) ||
      (c != null &&
          (((c['themeInspiration'] as Map?)?['referenceSetupId'] != null) ||
              (c.containsKey('themeInspiration') &&
                  (c.containsKey('customTheme') ||
                      c.containsKey('themeChoice'))) ||
              (c['selectedEventServices'] as List? ?? []).isNotEmpty))) {
    return CloudMobileProjection(e, null);
  }
  try {
    final configuration = c == null
        ? null
        : CustomerEventListConfiguration.fromJson(
            {
                'customTheme': '',
                'selectedAddOns': <Object>[],
                'foodChoiceSelections': <Object>[],
                ...c,
                if (c['themeInspiration'] case final Map theme) ...{
                  'customTheme': theme['notes'],
                  'themeChoice': (theme['notes'] as String).isNotEmpty
                      ? 'custom'
                      : c['packageThemeId'] != null
                      ? 'package'
                      : null,
                },
              }
              ..remove('themeInspiration')
              ..remove('selectedEventServices'),
          );
    final native = e['kind'] == 'marketplace_service'
        ? CustomerEventListEntry.marketplaceService(
            providerId: e['providerId'],
            serviceId: e['selectionId'],
            serviceName: e['name'],
            providerName: e['providerName'],
            expectedRevision: e['expectedRevision'],
            estimatedPrice: (e['estimatedPrice'] as num?)?.toDouble(),
            imageUrl: e['imageUrl'],
            configuration: configuration,
          )
        : CustomerEventListEntry(
            providerId: e['providerId'],
            packageId: e['selectionId'],
            packageName: e['name'],
            providerName: e['providerName'],
            estimatedPrice: (e['estimatedPrice'] as num?)?.toDouble(),
            imageUrl: e['imageUrl'],
            configuration: configuration,
          );
    return CloudMobileProjection(e, native);
  } on FormatException {
    return CloudMobileProjection(e, null);
  }
}

/// Retain the canonical editor's field vocabulary and all opaque metadata.
/// A Mobile-only choice must never silently disappear on the Web.
Map<String, dynamic> mergeCloudMobileEdit(
  Map<String, dynamic> existing,
  Map<String, dynamic> incoming,
) {
  if (projectCloudEntryToMobile(existing).readOnly) {
    throw const FormatException('This selection requires a compatible editor.');
  }
  var before = existing['configuration'] as Map<String, dynamic>?;
  final next = incoming['configuration'] as Map<String, dynamic>?;
  if (next == null) {
    return {
      ...existing,
      ...incoming,
      'configuration': existing['configuration'],
      'expectedRevision': existing['expectedRevision'],
      'href': existing['href'],
    };
  }
  if (before == null && existing['href'] != null) {
    before = {
      'themeInspiration': {'notes': '', 'referenceSetupId': null},
      'selectedEventServices': <Object>[],
    };
  }
  if (before == null) {
    return {...existing, ...incoming, 'href': existing['href']};
  }
  final configuration = {...before, ...next};
  // Provider-specific instructions have their own canonical field; the
  // customization form edits the nested event instructions only.
  if (before.containsKey('specialRequest')) {
    configuration['specialRequest'] = before['specialRequest'];
  }
  if (before['selectedAddOns'] is List && next['selectedAddOns'] is List) {
    configuration['selectedAddOns'] = [
      for (final addon in next['selectedAddOns'] as List)
        <String, dynamic>{
          for (final saved in before['selectedAddOns'] as List)
            if (saved['addonId'] == addon['addonId'] &&
                saved['providerId'] == addon['providerId'] &&
                saved['source'] == addon['source'])
              ...saved,
          ...addon,
        },
    ];
  }
  if (before.containsKey('themeInspiration')) {
    final notes = next['customTheme'] as String? ?? '';
    if (notes.length > 1000) {
      throw const FormatException('Web theme notes exceed 1000 characters.');
    }
    configuration['themeInspiration'] = <String, dynamic>{
      ...(before['themeInspiration'] as Map),
      'notes': notes,
    };
    configuration.remove('customTheme');
    configuration.remove('themeChoice');
  }
  for (final key in [
    'customTheme',
    'themeChoice',
    'selectedAddOns',
    'specialRequest',
  ]) {
    if (before.containsKey('themeInspiration') &&
        (key == 'customTheme' || key == 'themeChoice')) {
      continue;
    }
    if (before.containsKey(key)) continue;
    final value = next[key];
    final empty =
        value == null || value == '' || value is List && value.isEmpty;
    if (!empty) {
      throw FormatException(
        'This Web selection cannot safely save Mobile $key.',
      );
    }
    configuration.remove(key);
  }
  return {
    ...existing,
    ...incoming,
    'href': existing['href'],
    'configuration': configuration,
  };
}

CloudCustomerEventList advanceCloudEventList(
  CloudCustomerEventList current,
  CloudCustomerEventList proposed,
  int expectedRevision,
) {
  final before = current.toJson(), next = proposed.toJson();
  if (before['ownerUid'] != next['ownerUid'] ||
      before['revision'] != expectedRevision ||
      next['revision'] != expectedRevision + 1 ||
      _stable(before['migration']) != _stable(next['migration'])) {
    _bad();
  }
  return CloudCustomerEventList.fromJson(next, ownerUid: before['ownerUid']);
}

CloudCustomerEventList initializeCloudMigration(
  String uid,
  CloudCustomerEventList? cloud,
  CloudCustomerEventList local,
) {
  if (cloud != null) {
    return CloudCustomerEventList.fromJson(cloud.toJson(), ownerUid: uid);
  }
  final next = CloudCustomerEventList.fromJson(local.toJson(), ownerUid: uid);
  if (next.toJson()['revision'] != 0) _bad();
  return next;
}
