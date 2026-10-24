import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:feasta/features/authentication/data/repositories/customer_bookings_source.dart';
import 'package:flutter_test/flutter_test.dart';

// Narrow SDK doubles exercise the production query builder and page decoder.
// ignore: subtype_of_sealed_class
class Doc implements QueryDocumentSnapshot<Map<String, dynamic>> {
  Doc(this.id, this.fields);
  @override
  final String id;
  final Map<String, dynamic> fields;
  @override
  Map<String, dynamic> data() => fields;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// ignore: subtype_of_sealed_class
class Meta implements SnapshotMetadata {
  Meta({this.isFromCache = false, this.hasPendingWrites = false});
  @override
  final bool isFromCache;
  @override
  final bool hasPendingWrites;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// ignore: subtype_of_sealed_class
class Snapshot implements QuerySnapshot<Map<String, dynamic>> {
  Snapshot(this.docs, {SnapshotMetadata? metadata})
    : metadata = metadata ?? Meta();
  @override
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs;
  @override
  final SnapshotMetadata metadata;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestUser implements User {
  @override
  String get uid => 'customer-a';
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class Auth implements FirebaseAuth {
  @override
  User? currentUser = TestUser();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// Mutable query recorder for the test only.
// ignore: subtype_of_sealed_class, must_be_immutable
class QueryDouble implements CollectionReference<Map<String, dynamic>> {
  QueryDouble(this.records);
  final List<Doc> records;
  String? owner;
  Doc? cursor;
  int? maximum;
  final orders = <Object>[];
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
    expect(field, 'customerId');
    owner = isEqualTo as String;
    return this;
  }

  @override
  Query<Map<String, dynamic>> orderBy(Object field, {bool descending = false}) {
    expect(descending, true);
    orders.add(field);
    return this;
  }

  @override
  Query<Map<String, dynamic>> startAfterDocument(DocumentSnapshot snapshot) {
    cursor = snapshot as Doc;
    return this;
  }

  @override
  Query<Map<String, dynamic>> limit(int count) {
    maximum = count;
    return this;
  }

  @override
  Stream<QuerySnapshot<Map<String, dynamic>>> snapshots({
    bool includeMetadataChanges = false,
    ListenSource source = ListenSource.defaultSource,
  }) {
    expect(includeMetadataChanges, true);
    final sorted =
        records
            .where(
              (d) =>
                  d.fields['customerId'] == owner &&
                  d.fields.containsKey('createdAt'),
            )
            .toList()
          ..sort((a, b) {
            final time = (b.fields['createdAt'] as Timestamp).compareTo(
              a.fields['createdAt'] as Timestamp,
            );
            return time == 0 ? b.id.compareTo(a.id) : time;
          });
    final start = cursor == null
        ? 0
        : sorted.indexWhere((d) => d.id == cursor!.id) + 1;
    return Stream.value(Snapshot(sorted.skip(start).take(maximum!).toList()));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class Database implements FirebaseFirestore {
  Database(this.records);
  final List<Doc> records;
  final queries = <QueryDouble>[];
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) {
    expect(path, 'mainEvents');
    final query = QueryDouble(records);
    queries.add(query);
    return query;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  for (final count in [0, 7, 20, 21, 45]) {
    test(
      'production query pages $count equal timestamps with document ID tie-break',
      () async {
        final docs = List.generate(
          count,
          (i) => Doc(i.toString().padLeft(3, '0'), {
            'customerId': 'customer-a',
            'createdAt': Timestamp(100, 123),
          }),
        );
        final db = Database([
          ...docs,
          Doc('other', {
            'customerId': 'customer-b',
            'createdAt': Timestamp(200, 0),
          }),
          Doc('legacy-missing-date', {'customerId': 'customer-a'}),
        ]);
        final source = FirestoreCustomerBookingsSource(db, Auth());
        Object? cursor;
        final ids = <String>[];
        while (true) {
          final page = await source.watch('customer-a', cursor).first;
          ids.addAll(page.bookings.map((b) => b.id));
          final query = db.queries.last;
          expect(query.owner, 'customer-a');
          expect(query.maximum, 21);
          expect(query.orders, ['createdAt', FieldPath.documentId]);
          expect(query.cursor, same(cursor));
          expect(page.hasMore, count - ids.length > 0);
          if (!page.hasMore) break;
          cursor = page.cursor;
        }
        expect(ids, docs.reversed.map((d) => d.id).toList());
        expect(ids.toSet().length, count);
        expect(db.queries.length, count == 0 ? 1 : (count / 20).ceil());
      },
    );
  }
  test('unauthenticated and foreign UID never issue queries', () async {
    final db = Database([]);
    final auth = Auth();
    final source = FirestoreCustomerBookingsSource(db, auth);
    await expectLater(
      source.watch('customer-b', null),
      emitsError(isStateError),
    );
    auth.currentUser = null;
    await expectLater(
      source.watch('customer-a', null),
      emitsError(isStateError),
    );
    expect(db.queries, isEmpty);
  });
}
