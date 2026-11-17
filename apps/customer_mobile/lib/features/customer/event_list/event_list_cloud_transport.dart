import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../shared/models/customer_event_list_cloud_contract.dart';

/// Transport only. The controller owns customer authorization and lifecycle.
/// No client-side writes to Firestore are permitted.
abstract interface class EventListCloudGateway {
  Stream<EventListCloudSnapshot> watch(String uid);
  Future<EventListCloudMutationResult> mutate(Map<String, dynamic> command);
}

class EventListCloudTransport implements EventListCloudGateway {
  EventListCloudTransport({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
  }) : _firestore = firestore ?? FirebaseFirestore.instance,
       _functions =
           functions ??
           FirebaseFunctions.instanceFor(region: 'asia-southeast1');

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  /// Includes cache metadata so callers can distinguish a server-confirmed
  /// document from an offline cached snapshot.
  @override
  Stream<EventListCloudSnapshot> watch(String uid) {
    if (uid.isEmpty || uid == 'feasta_guest_device_v1') {
      throw ArgumentError('A customer UID is required.');
    }

    return _firestore
        .collection('customerEventLists')
        .doc(uid)
        .snapshots(includeMetadataChanges: true)
        .map((snapshot) {
          final data = snapshot.data();
          return EventListCloudSnapshot(
            document: data == null
                ? null
                : CloudCustomerEventList.fromJson(data, ownerUid: uid),
            fromCache: snapshot.metadata.isFromCache,
            hasPendingWrites: snapshot.metadata.hasPendingWrites,
          );
        });
  }

  /// All mutations go through the authenticated, server-authoritative callable.
  /// The caller must preserve the exact request ID and payload on uncertain
  /// retries; this transport never manufactures a replacement request ID.
  @override
  Future<EventListCloudMutationResult> mutate(
    Map<String, dynamic> command,
  ) async {
    final raw = await _functions
        .httpsCallable('mutateCustomerEventList')
        .call(command);

    if (raw.data is! Map) {
      throw const FormatException('Invalid Event List mutation response.');
    }

    final value = Map<String, dynamic>.from(raw.data as Map);

    final version = value['version'];
    final revision = value['revision'];
    final changed = value['changed'];
    final replayed = value['replayed'];
    final migrationReviewRequired = value['migrationReviewRequired'];
    final removed = value['removedIdentities'];
    final preserved = value['preservedIdentities'];

    if (version != 1 ||
        revision is! int ||
        revision < 0 ||
        changed is! bool ||
        replayed is! bool ||
        migrationReviewRequired is! bool ||
        removed is! List ||
        preserved is! List ||
        removed.any((item) => item is! String) ||
        preserved.any((item) => item is! String)) {
      throw const FormatException('Invalid Event List mutation response.');
    }

    return EventListCloudMutationResult(
      revision: revision,
      changed: changed,
      replayed: replayed,
      migrationReviewRequired: migrationReviewRequired,
      removedIdentities: List<String>.unmodifiable(removed.cast<String>()),
      preservedIdentities: List<String>.unmodifiable(preserved.cast<String>()),
    );
  }
}

class EventListCloudSnapshot {
  const EventListCloudSnapshot({
    required this.document,
    required this.fromCache,
    required this.hasPendingWrites,
  });

  final CloudCustomerEventList? document;
  final bool fromCache;
  final bool hasPendingWrites;

  /// A cached or locally pending snapshot cannot confirm a server mutation.
  bool get isServerConfirmed => !fromCache && !hasPendingWrites;
}

class EventListCloudMutationResult {
  const EventListCloudMutationResult({
    required this.revision,
    required this.changed,
    required this.replayed,
    required this.migrationReviewRequired,
    required this.removedIdentities,
    required this.preservedIdentities,
  });

  final int revision;
  final bool changed;
  final bool replayed;
  final bool migrationReviewRequired;
  final List<String> removedIdentities;
  final List<String> preservedIdentities;
}
