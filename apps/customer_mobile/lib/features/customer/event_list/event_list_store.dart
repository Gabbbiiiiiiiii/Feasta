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

/// Reads and read/modify/verified-write transactions share a process-wide queue.
/// This also prevents races between reconstructed store/controller instances.
/// Every mutation re-reads first: unreadable records are never replaced.
class EventListStore {
  EventListStore({EventListStorage? storage, DateTime Function()? now})
    : storage = storage ?? const SecureEventListStorage(),
      now = now ?? DateTime.now;
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
    final remaining = list.entries
        .where((e) => e.identity.key != entry.identity.key)
        .toList();
    if (remaining.length >= CustomerEventList.maxEntries) {
      throw const EventListCapacityException();
    }
    return [entry, ...remaining];
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
}
