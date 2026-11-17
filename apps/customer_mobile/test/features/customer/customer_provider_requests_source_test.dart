import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:feasta/features/authentication/data/repositories/customer_provider_requests_source.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter_test/flutter_test.dart';

import 'customer_bookings_source_test.dart' show Doc, Snapshot;

class RequestUser implements User {
  RequestUser(this.uid);
  @override
  final String uid;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class RequestAuth implements FirebaseAuth {
  @override
  User? currentUser = RequestUser('customer-a');
  final changes = StreamController<User?>.broadcast();
  @override
  Stream<User?> authStateChanges() async* {
    yield currentUser;
    yield* changes.stream;
  }

  void change(String? uid) {
    currentUser = uid == null ? null : RequestUser(uid);
    changes.add(currentUser);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// SDK boundary recorder: executes the production where/snapshots calls.
// ignore: subtype_of_sealed_class, must_be_immutable
class RequestQuery implements CollectionReference<Map<String, dynamic>> {
  RequestQuery(this.db);
  final RequestDatabase db;
  final filters = <String, Object?>{};
  @override
  Query<Map<String, dynamic>> where(
    Object field, {
    Object? isEqualTo,
    Object? isNotEqualTo,
    Object? isLessThan,
    Object? isLessThanOrEqualTo,
    Object? isGreaterThan,
    Object? isGreaterThanOrEqualTo,
    Object? arrayContains,
    Iterable<Object?>? arrayContainsAny,
    Iterable<Object?>? whereIn,
    Iterable<Object?>? whereNotIn,
    bool? isNull,
  }) {
    filters[field as String] = isEqualTo;
    return this;
  }

  @override
  Stream<QuerySnapshot<Map<String, dynamic>>> snapshots({
    bool includeMetadataChanges = false,
    ListenSource source = ListenSource.defaultSource,
  }) {
    db.listens++;
    return db.updates.stream.map(
      (docs) => Snapshot(
        db.injectInvalidSnapshot
            ? docs
            : docs
                  .where(
                    (doc) => filters.entries.every(
                      (entry) => doc.data()[entry.key] == entry.value,
                    ),
                  )
                  .toList(),
      ),
    );
  }

  // Unexpected orderBy/limit/get calls fail through noSuchMethod.
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class RequestDatabase implements FirebaseFirestore {
  RequestDatabase() {
    updates = StreamController<List<Doc>>.broadcast(
      onCancel: () => cancelled++,
    );
  }
  late final StreamController<List<Doc>> updates;
  final queries = <RequestQuery>[];
  int listens = 0;
  int cancelled = 0;
  bool injectInvalidSnapshot = false;
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) {
    expect(path, 'providerRequests');
    final query = RequestQuery(this);
    queries.add(query);
    return query;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

BookingModel booking({String owner = 'customer-a', String id = 'event-a'}) =>
    BookingModel.fromDoc(Doc(id, {'customerId': owner}));
Doc request(
  String id, {
  String owner = 'customer-a',
  String event = 'event-a',
  String kind = 'independent_package',
  String status = 'pending',
}) => Doc(id, {
  'customerId': owner,
  'mainEventId': event,
  'providerRequestId': id,
  'assignmentKind': kind,
  'status': status,
});

void main() {
  late RequestAuth auth;
  late RequestDatabase db;
  late CustomerProviderRequestsSource source;
  late List<QuerySnapshot<Map<String, dynamic>>> values;
  late List<Object> errors;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? subscription;
  Future<void> listen({BookingModel? event}) async {
    subscription = source
        .watch(event ?? booking())
        .listen(values.add, onError: (Object error) => errors.add(error));
    await pumpEventQueue();
  }

  setUp(() {
    auth = RequestAuth();
    db = RequestDatabase();
    source = CustomerProviderRequestsSource(db, auth);
    values = [];
    errors = [];
  });
  tearDown(() async {
    await subscription?.cancel();
    subscription = null;
    await auth.changes.close();
    await db.updates.close();
  });

  test(
    'production query uses authenticated owner AND event, with no sort or limit change',
    () async {
      await listen();
      expect(db.queries.single.filters, {
        'customerId': 'customer-a',
        'mainEventId': 'event-a',
      });
      expect(db.listens, 1);
    },
  );
  test('unauthenticated access never constructs a Firestore query', () async {
    auth.currentUser = null;
    await listen();
    expect(errors.single, isA<StateError>());
    expect(db.queries, isEmpty);
  });
  test(
    'caller-controlled booking owner cannot select another customer',
    () async {
      await listen(event: booking(owner: 'customer-b'));
      expect(errors.single, isA<StateError>());
      expect(db.queries, isEmpty);
    },
  );
  test('empty event fails closed without a broad query', () async {
    await listen(event: booking(id: ''));
    expect(errors.single, isA<StateError>());
    expect(db.queries, isEmpty);
  });
  test('query excludes other customers and other events', () async {
    await listen();
    db.updates.add([
      request('mine'),
      request('other', owner: 'customer-b'),
      request('elsewhere', event: 'event-b'),
    ]);
    await pumpEventQueue();
    expect(values.single.docs.map((d) => d.id), ['mine']);
  });
  for (final kind in [
    'independent_package',
    'independent_marketplace_service',
  ]) {
    test(
      'stored $kind ownership is readable without package filtering',
      () async {
        await listen();
        db.updates.add([request('request-a', kind: kind)]);
        await pumpEventQueue();
        expect(values.single.docs.single.data()['assignmentKind'], kind);
      },
    );
  }
  test(
    'mixed event emits all providers once and retains SDK ordering',
    () async {
      await listen();
      db.updates.add([
        request('catering'),
        request('photo', kind: 'independent_marketplace_service'),
        request('video', kind: 'independent_marketplace_service'),
      ]);
      await pumpEventQueue();
      final ids = values.single.docs.map((d) => d.id).toList();
      expect(ids, ['catering', 'photo', 'video']);
      expect(ids.toSet().length, 3);
    },
  );
  test(
    'realtime changes use one listener and preserve request identity',
    () async {
      await listen();
      db.updates.add([request('request-a')]);
      await pumpEventQueue();
      db.updates.add([request('request-a', status: 'accepted')]);
      await pumpEventQueue();
      expect(values.map((s) => s.docs.single.data()['status']), [
        'pending',
        'accepted',
      ]);
      expect(values.last.docs.single.id, 'request-a');
      expect(db.listens, 1);
    },
  );
  test(
    'signout cancels old listener and emits an error without more data',
    () async {
      await listen();
      auth.change(null);
      await pumpEventQueue();
      db.updates.add([request('stale')]);
      await pumpEventQueue();
      expect(db.cancelled, 1);
      expect(errors.single, isA<StateError>());
      expect(values, isEmpty);
    },
  );
  test(
    'account change cannot reuse the previous customer booking stream',
    () async {
      await listen();
      auth.change('customer-b');
      await pumpEventQueue();
      expect(db.cancelled, 1);
      expect(errors.single, isA<StateError>());
      expect(db.queries.length, 1);
    },
  );
  test(
    'queued snapshot after currentUser changes is rejected before auth event',
    () async {
      await listen();
      auth.currentUser = RequestUser('customer-b');
      db.updates.add([request('stale')]);
      await pumpEventQueue();
      expect(values, isEmpty);
      expect(errors.single, isA<StateError>());
    },
  );
  for (final fields in [
    <String, dynamic>{},
    {'customerId': 'customer-b', 'mainEventId': 'event-a'},
    {'customerId': 'customer-a', 'mainEventId': 'wrong'},
  ]) {
    test('inconsistent SDK snapshot fails closed: $fields', () async {
      db.injectInvalidSnapshot = true;
      await listen();
      db.updates.add([Doc('invalid', fields)]);
      await pumpEventQueue();
      expect(values, isEmpty);
      expect(errors.single, isA<StateError>());
    });
  }
  test(
    'missing documents and read errors propagate for display fail-closed handling',
    () async {
      await listen();
      db.updates.add([]);
      await pumpEventQueue();
      expect(values.single.docs, isEmpty);
      db.updates.addError(StateError('permission denied'));
      await pumpEventQueue();
      expect(errors.single, isA<StateError>());
    },
  );
  test(
    'both production display fallbacks route through the authenticated source',
    () {
      for (final path in [
        'booking_lifecycle_presentation.dart',
        'independent_booking_display.dart',
      ]) {
        final text = File('lib/features/customer/$path').readAsStringSync();
        expect(text, contains('watchCustomerProviderRequests(widget.booking)'));
        expect(text, isNot(contains(".collection('providerRequests')")));
      }
    },
  );
}
