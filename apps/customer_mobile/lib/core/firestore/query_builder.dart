import 'package:cloud_firestore/cloud_firestore.dart';

class QueryBuilder {
  QueryBuilder._();

  static const int defaultPageSize = 20;
  static const int maximumPageSize = 50;

  static Query<Map<String, dynamic>> applyFilters(
    Query<Map<String, dynamic>> query, {
    String? promotionType,
    String? providerId,
    bool? isFeatured,
    bool? isActive,
    bool? isDeleted,
  }) {
    if (promotionType != null && promotionType.isNotEmpty) {
      query = query.where('promotionType', isEqualTo: promotionType);
    }

    if (providerId != null && providerId.isNotEmpty) {
      query = query.where('providerId', isEqualTo: providerId);
    }

    if (isFeatured != null) {
      query = query.where('isFeatured', isEqualTo: isFeatured);
    }

    if (isActive != null) {
      query = query.where('isActive', isEqualTo: isActive);
    }

    if (isDeleted != null) {
      query = query.where('isDeleted', isEqualTo: isDeleted);
    }

    return query;
  }

  static Query<Map<String, dynamic>> applySorting(
    Query<Map<String, dynamic>> query, {
    required String orderByField,
    bool descending = false,
  }) {
    return query
        .orderBy(orderByField, descending: descending)
        .orderBy(FieldPath.documentId, descending: descending);
  }

  static Query<Map<String, dynamic>> applyPagination(
    Query<Map<String, dynamic>> query, {
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
    int? limit,
  }) {
    if (startAfter != null) query = query.startAfterDocument(startAfter);
    final boundedLimit = (limit ?? defaultPageSize).clamp(1, maximumPageSize);
    return query.limit(boundedLimit);
  }
}
