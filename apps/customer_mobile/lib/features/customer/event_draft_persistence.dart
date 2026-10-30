import '../../shared/models/food_choice_v2.dart';
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show TimeOfDay;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../shared/models/customer_address_model.dart';

abstract interface class EventDraftStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureEventDraftStore implements EventDraftStore {
  const SecureEventDraftStore();
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      storageNamespace: 'feasta_event_drafts_v1',
      resetOnError: false,
    ),
    iOptions: IOSOptions(
      accountName: 'feasta_event_drafts_v1',
      accessibility: KeychainAccessibility.unlocked_this_device,
      synchronizable: false,
    ),
  );
  void _supported() {
    if (kIsWeb ||
        ![
          TargetPlatform.android,
          TargetPlatform.iOS,
        ].contains(defaultTargetPlatform)) {
      throw UnsupportedError('Secure event drafts require Android or iOS.');
    }
  }

  @override
  Future<String?> read(String key) {
    _supported();
    return _storage.read(key: key);
  }

  @override
  Future<void> write(String key, String value) async {
    _supported();
    await _storage.write(key: key, value: value);
    if (await _storage.read(key: key) != value) {
      throw StateError('Draft write verification failed.');
    }
  }

  @override
  Future<void> delete(String key) {
    _supported();
    return _storage.delete(key: key);
  }
}

/// Independent of booking attempts: contains no request identity or consent.
class EventDraftPersistence {
  EventDraftPersistence(this.store);
  final EventDraftStore store;
  Future<void>? _tail;
  String key(String uid, String provider, String package) =>
      'event_draft_v1_${base64Url.encode(utf8.encode(jsonEncode([uid, provider, package])))}';
  Future<T> _serial<T>(Future<T> Function() action) {
    final next = _tail == null
        ? Future<T>.sync(action)
        : _tail!.then((_) => action());
    _tail = next.then<void>((_) {}, onError: (Object _, StackTrace stack) {});
    return next;
  }

  Future<Map<String, dynamic>?> read(
    String uid,
    String provider,
    String package,
  ) => _serial(() async {
    final raw = await store.read(key(uid, provider, package));
    if (raw == null) return null;
    final record = jsonDecode(raw);
    if (record is! Map ||
        record['version'] != 1 ||
        record['scope'] != jsonEncode([uid, provider, package]) ||
        record['form'] is! Map) {
      throw const FormatException('Unreadable event draft.');
    }
    return decode(Map<String, dynamic>.from(record['form'] as Map));
  });
  Future<bool> save(
    String uid,
    String provider,
    String package,
    Map<String, dynamic> form,
    String? Function() currentUid, {
    bool Function()? authorize,
  }) {
    final String raw;
    try {
      final encoded = encode(form);
      // Apply the same strict schema before writing and after reading.
      decode(Map<String, dynamic>.from(jsonDecode(jsonEncode(encoded)) as Map));
      raw = jsonEncode({
        'version': 1,
        'scope': jsonEncode([uid, provider, package]),
        'form': encoded,
      });
    } catch (error, stack) {
      return Future.error(error, stack);
    }
    return _serial(() async {
      if (currentUid() != uid || !(authorize?.call() ?? true)) return false;
      await store.write(key(uid, provider, package), raw);
      return true;
    });
  }

  Future<void> delete(
    String uid,
    String provider,
    String package,
    String? Function() currentUid, {
    bool Function()? authorize,
  }) => _serial(() async {
    if (currentUid() != uid || !(authorize?.call() ?? true)) {
      throw StateError('Account changed.');
    }
    await store.delete(key(uid, provider, package));
  });

  static Map<String, dynamic> encode(Map<String, dynamic> form) => {
    ...form,
    'date': (form['date'] as DateTime?)?.toIso8601String(),
    'start': _minutes(form['start'] as TimeOfDay?),
    'end': _minutes(form['end'] as TimeOfDay?),
    'eventAddress': (form['eventAddress'] as CustomerAddressModel?)?.toMap(),
    // Persist references only. Current details and prices must be fetched again.
    'addons': (form['addons'] as List)
        .map(
          (dynamic a) => {
            'addonId': a['addonId'],
            'providerId': a['providerId'],
            'source': a['source'],
          },
        )
        .toList(),
  };
  static int? _minutes(TimeOfDay? time) =>
      time == null ? null : time.hour * 60 + time.minute;
  static Map<String, dynamic> decode(Map<String, dynamic> form) {
    Never invalid() =>
        throw const FormatException('Invalid event draft fields.');
    for (final key in [
      'type',
      'city',
      'address',
      'notes',
      'ownNotes',
      'customTheme',
    ]) {
      if (form[key] is! String || (form[key] as String).length > 10000) {
        invalid();
      }
    }
    for (final key in ['tier', 'theme', 'themeChoice']) {
      if (form[key] != null &&
          (form[key] is! String || (form[key] as String).length > 200)) {
        invalid();
      }
    }
    if (form['step'] is! int ||
        form['step'] < 0 ||
        form['step'] > 2 ||
        form['guests'] is! int ||
        form['guests'] < 0 ||
        form['guests'] > 10000 ||
        form['own'] is! bool) {
      invalid();
    }
    if (form.containsKey('foodChoiceSelections')) {
      form['foodChoiceSelections'] = parseFoodChoiceSelections(
        form['foodChoiceSelections'],
      );
    }
    for (final key in ['foods', 'decorations', 'furniture']) {
      final list = form[key];
      if (list is! List ||
          list.length > 50 ||
          list.any(
            (dynamic x) => x is! String || x.isEmpty || x.length > 120,
          ) ||
          list.toSet().length != list.length) {
        invalid();
      }
    }
    if (![null, 'custom', 'none', 'package'].contains(form['themeChoice'])) {
      invalid();
    }
    for (final key in ['useCatering', 'useMarketplace']) {
      if (form[key] != null && form[key] is! bool) invalid();
    }
    final date = form['date'];
    if (date != null &&
        (date is! String ||
            DateTime.tryParse(date) == null ||
            DateTime.parse(date).toIso8601String() != date)) {
      invalid();
    }
    form['date'] = date == null ? null : DateTime.parse(date as String);
    for (final key in ['start', 'end']) {
      final minutes = form[key];
      if (minutes != null &&
          (minutes is! int || minutes < 0 || minutes > 1439)) {
        invalid();
      }
      form[key] = minutes == null
          ? null
          : TimeOfDay(hour: minutes ~/ 60, minute: minutes % 60);
    }
    final address = form['eventAddress'];
    if (address != null) {
      if (address is! Map<String, dynamic>) invalid();
      for (final key in [
        'id',
        'addressLabel',
        'fullAddress',
        'streetName',
        'barangay',
        'city',
        'province',
        'postalCode',
        'country',
        'houseNumber',
        'notes',
        'createdAt',
      ]) {
        if (address[key] is! String ||
            (address[key] as String).length > 10000) {
          invalid();
        }
      }
      if (DateTime.tryParse(address['createdAt'] as String) == null ||
          address['isDefault'] is! bool) {
        invalid();
      }
      for (final key in ['latitude', 'longitude']) {
        final coordinate = address[key];
        if (coordinate is! num ||
            !coordinate.isFinite ||
            coordinate.abs() > (key == 'latitude' ? 90 : 180)) {
          invalid();
        }
      }
      if (address['fullAddress'] != form['address'] ||
          address['city'] != form['city']) {
        invalid();
      }
      form['eventAddress'] = CustomerAddressModel.fromMap(address);
    }
    final addons = form['addons'];
    if (addons is! List || addons.length > 100) invalid();
    final addonIds = <String>{};
    for (final addon in addons) {
      if (addon is! Map ||
          ![
            'catering_provider',
            'feasta_addon_provider',
          ].contains(addon['source'])) {
        invalid();
      }
      for (final key in ['addonId', 'providerId']) {
        if (addon[key] is! String ||
            (addon[key] as String).isEmpty ||
            (addon[key] as String).length > 200) {
          invalid();
        }
      }
      // BookingSelection trims IDs before deduplicating them, irrespective of
      // source/provider. Reject ambiguity rather than repair a stored record.
      final id = (addon['addonId'] as String).trim();
      if (id.isEmpty || !addonIds.add(id)) invalid();
    }
    return form;
  }
}

EventDraftPersistence eventDraftPersistence = EventDraftPersistence(
  const SecureEventDraftStore(),
);
