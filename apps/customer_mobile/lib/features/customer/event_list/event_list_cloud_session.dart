import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../shared/models/customer_event_list.dart';
import '../../../shared/models/customer_event_list_cloud_contract.dart';
import 'event_list_cloud_transport.dart';
import 'event_list_store.dart';

/// One authenticated generation. Recovery records are owner scoped and contain
/// the exact command persisted before dispatch, including its request ID.
class EventListCloudSession {
  EventListCloudSession({
    required this.uid,
    required this.store,
    required this.transport,
    required this.authorize,
    required this.changed,
  });
  final String uid;
  final EventListStore store;
  final EventListCloudGateway transport;
  final void Function() authorize;
  final void Function() changed;
  CloudCustomerEventList? document;
  bool confirmed = false;
  Object? error;
  bool busy = false;
  static final _busyOwners = <String>{};
  void Function()? _operationAuthorize;
  void _guard() {
    authorize();
    _operationAuthorize?.call();
  }

  bool _closed = false;
  StreamSubscription<EventListCloudSnapshot>? _subscription;
  final _updates = StreamController<void>.broadcast();
  String get _key => 'event_list_cloud_pending_v1_$uid';

  void start() {
    try {
      _subscription = transport
          .watch(uid)
          .listen(
            (snapshot) {
              if (_closed || !snapshot.isServerConfirmed) return;
              try {
                authorize();
                final incoming = snapshot.document;
                if (incoming != null &&
                    document != null &&
                    (incoming.toJson()['revision'] as int) <
                        (document!.toJson()['revision'] as int)) {
                  return;
                }
                document = incoming;
                confirmed = true;
                error = null;
                _updates.add(null);
                changed();
              } catch (_) {
                /* An invalidated generation cannot publish. */
              }
            },
            onError: (Object failure) {
              if (_closed) return;
              error = failure;
              _updates.add(null);
              changed();
            },
          );
    } catch (failure) {
      error = failure;
      changed();
    }
  }

  Future<void> _wait(bool Function() ready) async {
    final deadline = DateTime.now().add(const Duration(seconds: 20));
    while (true) {
      _guard();
      if (_closed) throw StateError('Customer session changed.');
      if (error != null) throw StateError('Cloud listener failed: $error');
      if (ready()) return;
      final remaining = deadline.difference(DateTime.now());
      if (remaining <= Duration.zero) {
        throw TimeoutException('Waiting for server confirmation.');
      }
      await _updates.stream.first.timeout(remaining);
    }
  }

  String _requestId() {
    final random = Random.secure();
    return List.generate(
      24,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<void> _send(Map<String, dynamic> command) async {
    _guard();
    final raw = jsonEncode(command);
    await store.storage.write(_key, raw);
    _guard();
    if (await store.storage.read(_key) != raw) {
      throw StateError('Recovery persistence failed.');
    }
    _guard();
    final EventListCloudMutationResult result;
    try {
      result = await transport.mutate(jsonDecode(raw) as Map<String, dynamic>);
    } on FirebaseFunctionsException catch (failure) {
      _guard();
      if (const [
        'aborted',
        'invalid-argument',
        'failed-precondition',
        'resource-exhausted',
        'already-exists',
      ].contains(failure.code)) {
        await store.storage.write(_key, '');
      }
      rethrow;
    }
    _guard();
    await _wait(
      () =>
          confirmed &&
          document != null &&
          (document!.toJson()['revision'] as int) >= result.revision,
    );
    _guard();
    await store.storage.write(_key, '');
    _guard();
  }

  Future<bool> _initialize() async {
    if (error != null) {
      await _subscription?.cancel();
      _guard();
      error = null;
      confirmed = false;
      start();
    }
    await _wait(() => confirmed);
    final pending = await store.storage.read(_key);
    _guard();
    if (pending != null && pending.isNotEmpty) {
      await _send(jsonDecode(pending) as Map<String, dynamic>);
    }
    final recovered = pending != null && pending.isNotEmpty;
    if (document != null) return recovered;
    // A confirmed missing document is the only permission to read old local data.
    final local = await store.read(uid, authorize: _guard);
    _guard();
    if (document != null) return recovered;
    await _send({
      'version': 1,
      'requestId': _requestId(),
      'expectedRevision': null,
      'action': 'import',
      'local': CloudCustomerEventList.fromLocal(local).toJson(),
    });
    return recovered;
  }

  CustomerEventList project() {
    final value = document!.toJson();
    return CustomerEventList(
      ownerUid: uid,
      revision: value['revision'] as int,
      updatedAt: DateTime.now().toUtc(),
      entries: [
        for (final row in value['entries'] as List)
          ?projectCloudEntryToMobile(
            Map<String, dynamic>.from(row as Map),
          ).entry,
      ],
    );
  }

  List<Map<String, dynamic>> get unsupported => [
    for (final row in document?.toJson()['entries'] as List? ?? [])
      if (projectCloudEntryToMobile(
        Map<String, dynamic>.from(row as Map),
      ).readOnly)
        Map<String, dynamic>.from(row),
  ];

  Future<CustomerEventList> run(
    String action, {
    CustomerEventListEntry? entry,
    String? identity,
    int? expectedRevision,
    EventListIdentity? editingIdentity,
    Map<String, dynamic>? schedule,
    void Function()? authorizeOperation,
  }) async {
    if (busy || !_busyOwners.add(uid)) {
      throw StateError('An Event List operation is already running.');
    }
    _operationAuthorize = authorizeOperation;
    busy = true;
    changed();
    try {
      final recovered = await _initialize();
      _guard();
      if (action == 'load') return project();
      if (recovered) {
        throw StateError(
          'Previous save recovered. Review the refreshed Event List before making another change.',
        );
      }
      final current = document!.toJson();
      if (expectedRevision != null && current['revision'] != expectedRevision) {
        throw const EventListStaleException();
      }
      final command = <String, dynamic>{
        'version': 1,
        'requestId': _requestId(),
        'expectedRevision': current['revision'],
        'action': action,
      };
      if (entry != null) {
        final local = CustomerEventList(
          ownerUid: uid,
          revision: 0,
          updatedAt: DateTime.now().toUtc(),
          entries: [entry],
        );
        final incoming =
            (CloudCustomerEventList.fromLocal(local).toJson()['entries']
                        as List)
                    .single
                as Map<String, dynamic>;
        final existing = (current['entries'] as List)
            .where((e) => e['identity'] == incoming['identity'])
            .firstOrNull;
        if (editingIdentity != null &&
                editingIdentity.key != entry.identity.key ||
            expectedRevision != null &&
                (existing != null) != (editingIdentity != null)) {
          throw const EventListStaleException();
        }
        if (existing != null &&
            projectCloudEntryToMobile(
              Map<String, dynamic>.from(existing as Map),
            ).readOnly) {
          throw StateError('Use a compatible editor for this cloud selection.');
        }
        if (existing != null &&
            incoming['configuration'] == null &&
            existing['configuration'] != null) {
          return project();
        }
        if (existing == null && (current['entries'] as List).length >= 24) {
          throw const EventListCapacityException();
        }
        // Native editing has no href field. Preserve Web navigation metadata.
        if (existing != null) incoming['href'] = existing['href'];
        command['action'] = existing == null ? 'add' : 'update';
        command['entry'] = existing == null
            ? incoming
            : mergeCloudMobileEdit(
                Map<String, dynamic>.from(existing),
                incoming,
              );
        CloudCustomerEventList.fromJson({
          ...current,
          'entries': [
            for (final row in current['entries'] as List)
              if (row['identity'] != incoming['identity']) row,
            command['entry'],
          ],
        }, ownerUid: uid);
      }
      if (identity != null) command['identity'] = identity;
      if (action == 'schedule') {
        final candidate = {...current, 'schedule': schedule};
        CloudCustomerEventList.fromJson(candidate, ownerUid: uid);
        command['schedule'] = schedule;
      }
      await _send(command);
      return project();
    } finally {
      busy = false;
      _operationAuthorize = null;
      _busyOwners.remove(uid);
      if (!_closed) changed();
    }
  }

  void close() {
    _closed = true;
    unawaited(_subscription?.cancel());
    _updates.add(null);
    unawaited(_updates.close());
  }
}

String nativeCloudIdentity(EventListIdentity identity) => [
  identity.parts.first == 'package' ? 'catering_package' : identity.parts.first,
  ...identity.parts.skip(1),
].join(':');
