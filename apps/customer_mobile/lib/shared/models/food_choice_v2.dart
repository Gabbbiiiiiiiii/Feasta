/// Food-choice IDs are client selections; the booking server owns the rules.
class FoodChoiceGroupV2 {
  const FoodChoiceGroupV2(
    this.id,
    this.title,
    this.selectionCount,
    this.options,
  );
  final String id;
  final String title;
  final int selectionCount;
  final Map<String, String> options;
  static List<FoodChoiceGroupV2> parse(Object? value) {
    if (value == null) return const [];
    if (value is! List || value.length > 10) {
      throw const FormatException('Invalid food groups');
    }
    final groups = <FoodChoiceGroupV2>[];
    var total = 0;
    final id = RegExp(r'^[A-Za-z0-9_-]{1,64}$');
    for (final row in value) {
      if (row is! Map ||
          row.length != 4 ||
          row['id'] is! String ||
          !id.hasMatch(row['id'] as String) ||
          row['title'] is! String ||
          (row['title'] as String).trim().isEmpty ||
          (row['title'] as String).length > 80 ||
          row['selectionCount'] is! int ||
          row['options'] is! List) {
        throw const FormatException('Invalid food group');
      }
      final options = <String, String>{};
      final names = <String>{};
      for (final option in row['options'] as List) {
        if (option is! Map ||
            option.length != 2 ||
            option['id'] is! String ||
            !id.hasMatch(option['id'] as String) ||
            option['name'] is! String ||
            (option['name'] as String).trim().isEmpty ||
            (option['name'] as String).length > 120 ||
            options.containsKey(option['id']) ||
            !names.add(
              (option['name'] as String).trim().toLowerCase().replaceAll(
                RegExp(r'\s+'),
                ' ',
              ),
            )) {
          throw const FormatException('Invalid food option');
        }
        options[option['id'] as String] = option['name'] as String;
      }
      total += options.length;
      if (options.length < 2 ||
          options.length > 10 ||
          total > 50 ||
          (row['selectionCount'] as int) < 1 ||
          (row['selectionCount'] as int) > options.length ||
          groups.any(
            (g) =>
                g.id == row['id'] ||
                g.title.trim().toLowerCase() ==
                    (row['title'] as String).trim().toLowerCase(),
          )) {
        throw const FormatException('Invalid food rules');
      }
      groups.add(
        FoodChoiceGroupV2(
          row['id'] as String,
          row['title'] as String,
          row['selectionCount'] as int,
          Map.unmodifiable(options),
        ),
      );
    }
    return List.unmodifiable(groups);
  }
}

List<Map<String, dynamic>> parseFoodChoiceSelections(Object? value) {
  if (value == null) return [];
  if (value is! List || value.length > 10) {
    throw const FormatException('Invalid food selections');
  }
  final result = <Map<String, dynamic>>[];
  final id = RegExp(r'^[A-Za-z0-9_-]{1,64}$');
  for (final row in value) {
    if (row is! Map ||
        row.length != 2 ||
        row['groupId'] is! String ||
        !id.hasMatch(row['groupId'] as String) ||
        row['optionIds'] is! List ||
        (row['optionIds'] as List).length > 10 ||
        (row['optionIds'] as List).any(
          (v) => v is! String || !id.hasMatch(v),
        ) ||
        (row['optionIds'] as List).toSet().length !=
            (row['optionIds'] as List).length ||
        result.any((s) => s['groupId'] == row['groupId'])) {
      throw const FormatException('Invalid food selections');
    }
    result.add({
      'groupId': row['groupId'],
      'optionIds': List<String>.from(row['optionIds'] as List)..sort(),
    });
  }
  result.sort(
    (a, b) => (a['groupId'] as String).compareTo(b['groupId'] as String),
  );
  return result;
}

bool validFoodChoiceSelections(
  List<FoodChoiceGroupV2> groups,
  List<Map<String, dynamic>> value,
) {
  final selected = parseFoodChoiceSelections(value);
  if (groups.length != selected.length) return false;
  return groups.every((g) {
    final matches = selected.where((s) => s['groupId'] == g.id);
    if (matches.length != 1) return false;
    final ids = matches.single['optionIds'] as List;
    return ids.length == g.selectionCount && ids.every(g.options.containsKey);
  });
}
