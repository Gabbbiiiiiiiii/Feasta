import 'package:cloud_functions/cloud_functions.dart';

/// An approved and active occasion from Admin File Maintenance.
class CatalogOccasion {
  const CatalogOccasion({
    required this.id,
    required this.label,
    required this.sortOrder,
    required this.revision,
    required this.applicableServiceCategoryCodes,
  });

  final String id;
  final String label;
  final int sortOrder;
  final int revision;
  final List<String> applicableServiceCategoryCodes;

  static final RegExp _idPattern = RegExp(r'^[a-z][a-z0-9_]{1,63}$');

  factory CatalogOccasion.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final label = json['label'];
    final sortOrder = json['sortOrder'];
    final revision = json['revision'];
    final categories = json['applicableServiceCategoryCodes'];

    if (id is! String ||
        !_idPattern.hasMatch(id) ||
        label is! String ||
        label.trim().length < 2 ||
        label.trim().length > 80 ||
        sortOrder is! int ||
        revision is! int ||
        revision < 1 ||
        categories is! List ||
        categories.isEmpty ||
        categories.length > 50 ||
        categories.any((value) => value is! String || value.trim().isEmpty)) {
      throw const FormatException('Invalid occasion catalog item.');
    }

    return CatalogOccasion(
      id: id,
      label: label.trim(),
      sortOrder: sortOrder,
      revision: revision,
      applicableServiceCategoryCodes: List<String>.unmodifiable(
        categories.cast<String>(),
      ),
    );
  }
}

/// Guest-accessible catalog reader.
///
/// Never substitutes local hard-coded occasions when the authoritative
/// catalog fails. Callers should display an explicit unavailable state.
class OccasionCatalogService {
  OccasionCatalogService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'asia-southeast1');

  final FirebaseFunctions _functions;

  static const int _pageSize = 50;
  static const int _maxPages = 5;
  static const int _maxOccasions = 200;

  Future<List<CatalogOccasion>> listActiveOccasions({
    String? serviceCategoryCode,
  }) async {
    final callable = _functions.httpsCallable(
      'listApprovedOccasions',
      options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
    );

    final results = <CatalogOccasion>[];
    final seen = <String>{};
    final visitedCursors = <String>{};

    String? cursor;
    int? expectedRevision;
    var complete = false;

    for (var page = 0; page < _maxPages; page++) {
      final response = await callable
          .call<Map<String, dynamic>>(<String, dynamic>{
            'serviceCategoryCode': serviceCategoryCode,
            'cursor': cursor,
            'pageSize': _pageSize,
          });

      final payload = response.data;
      final revision = payload['revision'];
      final items = payload['items'];
      final nextCursor = payload['nextCursor'];

      if (revision is! int ||
          revision < 1 ||
          items is! List ||
          items.length > _pageSize ||
          (nextCursor != null && nextCursor is! String)) {
        throw const FormatException('Invalid occasion catalog response.');
      }

      expectedRevision ??= revision;

      if (revision != expectedRevision) {
        throw StateError('Occasion catalog changed during loading.');
      }

      for (final raw in items) {
        if (raw is! Map) {
          throw const FormatException('Invalid occasion catalog item.');
        }

        final occasion = CatalogOccasion.fromJson(
          Map<String, dynamic>.from(raw),
        );

        if (!seen.add(occasion.id)) {
          throw const FormatException('Duplicate occasion identifier.');
        }

        if (serviceCategoryCode != null &&
            !occasion.applicableServiceCategoryCodes.contains(
              serviceCategoryCode,
            )) {
          throw const FormatException(
            'Occasion category does not match the request.',
          );
        }

        results.add(occasion);

        if (results.length > _maxOccasions) {
          throw StateError('Occasion catalog exceeds supported size.');
        }
      }

      if (nextCursor == null) {
        complete = true;
        break;
      }

      if (nextCursor.isEmpty || !visitedCursors.add(nextCursor)) {
        throw const FormatException('Invalid occasion catalog pagination.');
      }

      cursor = nextCursor;
    }

    if (!complete) {
      throw StateError('Occasion catalog was not fully loaded.');
    }

    results.sort((a, b) {
      final order = a.sortOrder.compareTo(b.sortOrder);
      return order != 0 ? order : a.id.compareTo(b.id);
    });

    return List<CatalogOccasion>.unmodifiable(results);
  }

  /// Resolves old saved labels such as "Birthday" and canonical IDs such
  /// as "birthday" against the currently active catalog.
  ///
  /// Returns null when an old occasion is no longer selectable.
  String? resolveActiveId(
    String? previousValue,
    List<CatalogOccasion> activeOccasions,
  ) {
    final value = previousValue?.trim().toLowerCase();

    if (value == null || value.isEmpty) return null;

    for (final occasion in activeOccasions) {
      if (occasion.id == value || occasion.label.toLowerCase() == value) {
        return occasion.id;
      }
    }

    return null;
  }

  String? labelForId(String id, List<CatalogOccasion> activeOccasions) {
    for (final occasion in activeOccasions) {
      if (occasion.id == id) return occasion.label;
    }

    return null;
  }
}
