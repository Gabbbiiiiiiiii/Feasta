import 'package:cloud_firestore/cloud_firestore.dart';

import '../core/constants/promotion_firestore_schema.dart';
import '../core/firestore/query_builder.dart';
import '../core/cache/promotion_cache.dart';
import '../models/promotion_model.dart';
import 'package:cloud_firestore/cloud_firestore.dart' as _fs;

class PromotionRepository {
  PromotionRepository({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _collection =>
      _firestore.collection(PromotionFirestoreSchema.collectionName);

  Future<PromotionModel> createPromotion(PromotionModel promotion) async {
    final ref = _collection.doc();
    final payload = promotion.copyWith(id: ref.id).toFirestoreMap();

    await ref.set(payload);

    final snapshot = await ref.get();
    return PromotionModel.fromDoc(snapshot);
  }

  Future<PromotionModel?> getPromotionById(String id) async {
    final snapshot = await _collection.doc(id).get();
    if (!snapshot.exists) return null;
    return PromotionModel.fromDoc(snapshot);
  }

  Future<List<PromotionModel>> getPromotions({bool includeInactive = true}) async {
    return getPromotionsWithOptions(
      includeInactive: includeInactive,
    );
  }

  Future<List<PromotionModel>> getPromotionsWithOptions({
    bool includeInactive = true,
    String? promotionType,
    String? providerId,
    bool? isFeatured,
    bool includeDeleted = false,
    String orderByField = PromotionFirestoreSchema.orderField,
    bool descending = false,
    int? limit,
  }) async {
    // Try cache first for read-heavy list queries
    final cacheKey = 'promotions:${includeInactive ? 'all' : 'active'}:${promotionType ?? ''}:${providerId ?? ''}:${isFeatured == null ? '' : isFeatured}:${includeDeleted ? 'del' : 'nodelete'}:$orderByField:${descending ? 'desc' : 'asc'}:${limit ?? 'nolimit'}';
    final cached = PromotionCache.instance.get<List<PromotionModel>>(cacheKey);
    if (cached != null) return cached;

    Query<Map<String, dynamic>> query = _collection;

    query = QueryBuilder.applyFilters(query,
        promotionType: promotionType,
        providerId: providerId,
        isFeatured: isFeatured,
        isActive: !includeInactive,
        isDeleted: !includeDeleted);

    query = QueryBuilder.applySorting(query, orderByField: orderByField, descending: descending);

    query = QueryBuilder.applyPagination(query, limit: limit);

    final snapshot = await query.get();
    final results = snapshot.docs.map(PromotionModel.fromDoc).toList();

    // Cache short-lived list results to reduce reads in admin UI
    PromotionCache.instance.set<List<PromotionModel>>(cacheKey, results, ttl: Duration(seconds: 60));

    return results;
  }

  Stream<List<PromotionModel>> watchPromotions({bool includeInactive = true}) {
    return watchPromotionsWithOptions(includeInactive: includeInactive);
  }

  Stream<List<PromotionModel>> watchPromotionsWithOptions({
    bool includeInactive = true,
    String? promotionType,
    String? providerId,
    bool? isFeatured,
    bool includeDeleted = false,
    String orderByField = PromotionFirestoreSchema.orderField,
    bool descending = false,
  }) {
    Query<Map<String, dynamic>> query = _collection;

    query = QueryBuilder.applyFilters(query,
        promotionType: promotionType,
        providerId: providerId,
        isFeatured: isFeatured,
        isActive: !includeInactive,
        isDeleted: !includeDeleted);

    query = QueryBuilder.applySorting(query, orderByField: orderByField, descending: descending);

    return query.snapshots().map((snapshot) => snapshot.docs.map(PromotionModel.fromDoc).toList());
  }

  Stream<List<PromotionModel>> watchActivePromotions() {
    Query<Map<String, dynamic>> query = _collection;
    query = QueryBuilder.applyFilters(query, isActive: true, isDeleted: false);
    query = QueryBuilder.applySorting(query, orderByField: PromotionFirestoreSchema.orderField, descending: false);
    return query.snapshots().map((snapshot) => snapshot.docs.map(PromotionModel.fromDoc).toList());
  }

  Future<void> updatePromotion(String id, Map<String, dynamic> data) async {
    await _collection.doc(id).update({
      ...data,
      PromotionFirestoreSchema.updatedAtField: FieldValue.serverTimestamp(),
    });
  }

  Future<void> deletePromotion(String id) async {
    // Soft-delete: mark document as deleted so it can be restored if needed
    await _collection.doc(id).update({
      PromotionFirestoreSchema.isDeletedField: true,
      PromotionFirestoreSchema.updatedAtField: FieldValue.serverTimestamp(),
    });
  }

  Future<void> recordImpression(String promotionId, {String? providerId}) async {
    final promoRef = _collection.doc(promotionId);
    final dateKey = _dateKey(DateTime.now());
    final statsRef = _firestore.collection('promotion_stats').doc(promotionId).collection('daily').doc(dateKey);

    await _firestore.runTransaction((tx) async {
      // increment promotion impressions
      final promoSnap = await tx.get(promoRef);
      if (!promoSnap.exists) throw Exception('Promotion not found');
      tx.update(promoRef, {PromotionFirestoreSchema.impressionsField: _fs.FieldValue.increment(1), PromotionFirestoreSchema.updatedAtField: _fs.FieldValue.serverTimestamp()});

      // update daily stats
      final statsSnap = await tx.get(statsRef);
      if (!statsSnap.exists) {
        tx.set(statsRef, {
          'impressions': 1,
          'clicks': 0,
          'date': DateTime.now(),
          'promotionId': promotionId,
          'providerId': providerId,
        });
      } else {
        tx.update(statsRef, {'impressions': _fs.FieldValue.increment(1)});
      }
    });
  }

  Future<void> recordClick(String promotionId, {String? providerId}) async {
    final promoRef = _collection.doc(promotionId);
    final dateKey = _dateKey(DateTime.now());
    final statsRef = _firestore.collection('promotion_stats').doc(promotionId).collection('daily').doc(dateKey);

    await _firestore.runTransaction((tx) async {
      final promoSnap = await tx.get(promoRef);
      if (!promoSnap.exists) throw Exception('Promotion not found');
      tx.update(promoRef, {
        PromotionFirestoreSchema.clicksField: _fs.FieldValue.increment(1),
        PromotionFirestoreSchema.lastClickedAtField: _fs.FieldValue.serverTimestamp(),
        PromotionFirestoreSchema.updatedAtField: _fs.FieldValue.serverTimestamp(),
      });

      final statsSnap = await tx.get(statsRef);
      if (!statsSnap.exists) {
        tx.set(statsRef, {
          'impressions': 0,
          'clicks': 1,
          'date': DateTime.now(),
          'promotionId': promotionId,
          'providerId': providerId,
        });
      } else {
        tx.update(statsRef, {'clicks': _fs.FieldValue.increment(1)});
      }
    });
  }

  String _dateKey(DateTime dt) {
    final y = dt.year.toString().padLeft(4, '0');
    final m = dt.month.toString().padLeft(2, '0');
    final d = dt.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }
}
