import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../shared/models/customer_event_list.dart';

abstract interface class EventListStorage {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class SecureEventListStorage implements EventListStorage {
  const SecureEventListStorage();
  static const namespace = 'feasta_customer_event_lists_v1';
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(storageNamespace: namespace, resetOnError: false),
    iOptions: IOSOptions(
      accountName: namespace,
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
      throw UnsupportedError('Secure Event Lists require Android or iOS.');
    }
  }

  @override
  Future<String?> read(String key) {
    _supported();
    return _storage.read(key: key);
  }

  @override
  Future<void> write(String key, String value) {
    _supported();
    return _storage.write(key: key, value: value);
  }
}

class EventListCapacityException implements Exception {
  const EventListCapacityException();
  @override
  String toString() => 'The Event List already contains 24 items.';
}

class EventListStaleException implements Exception {
  const EventListStaleException();
}

CustomerEventListEntry _protectConfiguration(
  CustomerEventList list,
  CustomerEventListEntry entry,
) {
  if (entry.configuration != null) return entry;
  for (final existing in list.entries) {
    if (existing.identity.key == entry.identity.key &&
        existing.configuration != null) {
      return existing;
    }
  }
  return entry;
}

/// Reads and read/modify/verified-write transactions share a process-wide queue.
/// This also prevents races between reconstructed store/controller instances.
/// Every mutation re-reads first: unreadable records are never replaced.
class EventListStore {
  EventListStore({EventListStorage? storage, DateTime Function()? now})
    : storage = storage ?? const SecureEventListStorage(),
      now = now ?? DateTime.now;
  // Guest planning uses a separate local record, never a customer's UID.
  static const guestOwnerUid = 'feasta_guest_device_v1';
  static const _guestStorageKey = 'event_list_guest_device_v1';

  final EventListStorage storage;
  final DateTime Function() now;
  static Future<void> _tail = Future.value();
  String key(String uid) =>
      'event_list_v1_${base64Url.encode(utf8.encode(eventListId(uid, owner: true)))}';
  Future<T> _serial<T>(Future<T> Function() action) {
    final next = _tail.then((_) => action());
    _tail = next.then<void>((_) {}, onError: (Object _, StackTrace stack) {});
    return next;
  }

  Future<CustomerEventList> _read(String uid) async {
    final raw = await storage.read(key(uid));
    return raw == null
        ? CustomerEventList(
            ownerUid: uid,
            revision: 0,
            updatedAt: now().toUtc(),
            entries: [],
          )
        : CustomerEventList.decode(raw, ownerUid: uid);
  }

  Future<CustomerEventList> read(
    String uid, {
    required void Function() authorize,
  }) => _serial(() async {
    authorize();
    final result = await _read(uid);
    authorize();
    return result;
  });
  Future<CustomerEventList> _mutate(
    String uid,
    void Function() authorize,
    List<CustomerEventListEntry> Function(CustomerEventList) change,
  ) => _serial(() async {
    authorize();
    final previous = await _read(uid);
    authorize();
    final next = CustomerEventList(
      ownerUid: uid,
      revision: previous.revision + 1,
      updatedAt: now().toUtc(),
      entries: change(previous),
    );
    final raw = next.encode();
    CustomerEventList.decode(raw, ownerUid: uid);
    authorize();
    await storage.write(key(uid), raw);
    // A dispatched platform write cannot be cancelled. It remains scoped to
    // its original owner; a changed session must never receive success/state.
    authorize();
    if (await storage.read(key(uid)) != raw) {
      throw StateError('Event List persistence verification failed.');
    }
    authorize();
    return next;
  });
  Future<CustomerEventList> addPackage(
    String uid,
    CustomerEventListEntry entry, {
    required void Function() authorize,
  }) => _mutate(uid, authorize, (list) {
    final protectedEntry = _protectConfiguration(list, entry);
    final remaining = list.entries
        .where((e) => e.identity.key != entry.identity.key)
        .toList();
    if (remaining.length >= CustomerEventList.maxEntries) {
      throw const EventListCapacityException();
    }
    return [protectedEntry, ...remaining];
  });

  /// Compare inside the serialized transaction, before any write. Stale reviews
  /// cannot restore deleted entries or overwrite a newer configuration.
  Future<CustomerEventList> saveConfiguration(
    String uid,
    CustomerEventListEntry entry, {
    required int expectedRevision,
    required void Function() authorize,
    EventListIdentity? editingIdentity,
  }) => _mutate(uid, authorize, (list) {
    final key = entry.identity.key;
    final exists = list.entries.any((item) => item.identity.key == key);
    if (list.revision != expectedRevision ||
        (editingIdentity != null && editingIdentity.key != key) ||
        exists != (editingIdentity != null)) {
      throw const EventListStaleException();
    }
    if (editingIdentity != null) {
      return list.entries
          .map((item) => item.identity.key == key ? entry : item)
          .toList();
    }
    if (list.entries.length >= CustomerEventList.maxEntries) {
      throw const EventListCapacityException();
    }
    return [entry, ...list.entries];
  });

  Future<CustomerEventList> removePackage(
    String uid,
    EventListIdentity identity, {
    required void Function() authorize,
  }) {
    if (identity.parts.first != 'package') {
      return Future.error(
        UnsupportedError('Only package entries are supported.'),
      );
    }
    return _mutate(
      uid,
      authorize,
      (list) =>
          list.entries.where((e) => e.identity.key != identity.key).toList(),
    );
  }

  Future<CustomerEventList> clear(
    String uid, {
    required void Function() authorize,
  }) => _mutate(uid, authorize, (_) => []);

  // Guest records are isolated from authenticated customer records.
  Future<CustomerEventList> _readGuest() async {
    final raw = await storage.read(_guestStorageKey);

    return raw == null
        ? CustomerEventList(
            ownerUid: guestOwnerUid,
            revision: 0,
            updatedAt: now().toUtc(),
            entries: [],
          )
        : CustomerEventList.decode(raw, ownerUid: guestOwnerUid);
  }

  Future<CustomerEventList> guestRead({required void Function() authorize}) =>
      _serial(() async {
        authorize();
        final result = await _readGuest();
        authorize();
        return result;
      });

  Future<CustomerEventList> _mutateGuest(
    void Function() authorize,
    List<CustomerEventListEntry> Function(CustomerEventList) change,
  ) => _serial(() async {
    authorize();

    final previous = await _readGuest();
    authorize();

    final next = CustomerEventList(
      ownerUid: guestOwnerUid,
      revision: previous.revision + 1,
      updatedAt: now().toUtc(),
      entries: change(previous),
    );

    final raw = next.encode();
    CustomerEventList.decode(raw, ownerUid: guestOwnerUid);

    authorize();
    await storage.write(_guestStorageKey, raw);
    authorize();

    if (await storage.read(_guestStorageKey) != raw) {
      throw StateError('Guest Event List persistence verification failed.');
    }

    authorize();
    return next;
  });

  Future<CustomerEventList> guestAddPackage(
    CustomerEventListEntry entry, {
    required void Function() authorize,
  }) => _mutateGuest(authorize, (list) {
    final protectedEntry = _protectConfiguration(list, entry);
    final remaining = list.entries
        .where((item) => item.identity.key != entry.identity.key)
        .toList();

    if (remaining.length >= CustomerEventList.maxEntries) {
      throw const EventListCapacityException();
    }

    return [protectedEntry, ...remaining];
  });

  Future<CustomerEventList> guestRemovePackage(
    EventListIdentity identity, {
    required void Function() authorize,
  }) {
    if (identity.parts.first != 'package') {
      return Future.error(
        UnsupportedError('Only package entries are supported.'),
      );
    }

    return _mutateGuest(
      authorize,
      (list) => list.entries
          .where((item) => item.identity.key != identity.key)
          .toList(),
    );
  }

  Future<CustomerEventList> guestClear({required void Function() authorize}) =>
      _mutateGuest(authorize, (_) => []);

  /// All-or-nothing capacity validation followed by verified customer storage.
  /// The guest record is cleared only after the customer record is verified.
  /// Repeated transfers are safe because identity duplicates are skipped.
  Future<CustomerEventList> transferGuestToCustomer(
    String uid, {
    required void Function() authorize,
  }) => _serial(() async {
    authorize();

    if (uid == guestOwnerUid) {
      throw StateError('Guest owner cannot be a customer account.');
    }

    final guest = await _readGuest();
    authorize();

    final customer = await _read(uid);
    authorize();

    if (guest.entries.isEmpty) {
      return customer;
    }

    final merged = [...customer.entries];
    final known = customer.entries.map((item) => item.identity.key).toSet();

    for (final item in guest.entries) {
      if (known.add(item.identity.key)) {
        merged.add(item);
      }
    }

    if (merged.length > CustomerEventList.maxEntries) {
      throw const EventListCapacityException();
    }

    CustomerEventList result = customer;

    if (merged.length != customer.entries.length) {
      result = CustomerEventList(
        ownerUid: uid,
        revision: customer.revision + 1,
        updatedAt: now().toUtc(),
        entries: merged,
      );

      final raw = result.encode();
      CustomerEventList.decode(raw, ownerUid: uid);

      authorize();
      await storage.write(key(uid), raw);
      authorize();

      if (await storage.read(key(uid)) != raw) {
        throw StateError('Customer transfer verification failed.');
      }
      authorize();
    }

    final clearedGuest = CustomerEventList(
      ownerUid: guestOwnerUid,
      revision: guest.revision + 1,
      updatedAt: now().toUtc(),
      entries: [],
    );

    final guestRaw = clearedGuest.encode();
    CustomerEventList.decode(guestRaw, ownerUid: guestOwnerUid);

    authorize();
    await storage.write(_guestStorageKey, guestRaw);
    authorize();

    if (await storage.read(_guestStorageKey) != guestRaw) {
      throw StateError('Guest transfer cleanup verification failed.');
    }

    authorize();
    return result;
  });
}
