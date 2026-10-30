import 'package:flutter_test/flutter_test.dart';
import '../lib/shared/models/food_choice_v2.dart';

void main() {
  final rows = [
    {
      'id': 'main',
      'title': 'Main dish',
      'selectionCount': 1,
      'options': [
        {'id': 'a', 'name': 'Chicken'},
        {'id': 'b', 'name': 'Pork'},
      ],
    },
  ];
  test('legacy needs no choices', () {
    expect(FoodChoiceGroupV2.parse(null), isEmpty);
    expect(validFoodChoiceSelections([], []), isTrue);
  });
  test('requires exact count and known IDs', () {
    final groups = FoodChoiceGroupV2.parse(rows);
    expect(validFoodChoiceSelections(groups, []), isFalse);
    expect(
      validFoodChoiceSelections(groups, [
        {
          'groupId': 'main',
          'optionIds': ['a'],
        },
      ]),
      isTrue,
    );
    expect(
      validFoodChoiceSelections(groups, [
        {
          'groupId': 'main',
          'optionIds': ['a', 'b'],
        },
      ]),
      isFalse,
    );
    expect(
      validFoodChoiceSelections(groups, [
        {
          'groupId': 'main',
          'optionIds': ['unknown'],
        },
      ]),
      isFalse,
    );
  });
  test('rejects forged rules and duplicate IDs', () {
    expect(
      () => parseFoodChoiceSelections([
        {
          'groupId': 'main',
          'optionIds': ['a'],
          'selectionCount': 0,
        },
      ]),
      throwsFormatException,
    );
    expect(
      () => parseFoodChoiceSelections([
        {
          'groupId': 'main',
          'optionIds': ['a', 'a'],
        },
      ]),
      throwsFormatException,
    );
  });
  test('round-trips IDs', () {
    final selected = [
      {
        'groupId': 'main',
        'optionIds': ['b'],
      },
    ];
    expect(parseFoodChoiceSelections(selected), selected);
  });
}
