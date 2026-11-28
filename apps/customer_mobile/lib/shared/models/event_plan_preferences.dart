import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class EventPlanPreferences {
  const EventPlanPreferences({
    this.eventType = 'Birthday',
    this.guestCount,
    this.themes = const <String>[],
    this.customTheme = '',
  });

  final String eventType;
  final int? guestCount;
  final List<String> themes;
  final String customTheme;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'eventType': eventType,
    'guestCount': guestCount,
    'themes': themes,
    'customTheme': customTheme,
  };

  factory EventPlanPreferences.fromJson(Map<String, dynamic> json) {
    final rawThemes = json['themes'];

    return EventPlanPreferences(
      eventType: json['eventType']?.toString().trim().isNotEmpty == true
          ? json['eventType'].toString().trim()
          : 'Birthday',
      guestCount: json['guestCount'] is num
          ? (json['guestCount'] as num).toInt()
          : null,
      themes: rawThemes is List
          ? rawThemes
                .map((value) => value.toString())
                .where((value) => value.trim().isNotEmpty)
                .toList(growable: false)
          : const <String>[],
      customTheme: json['customTheme']?.toString() ?? '',
    );
  }
}

class EventPlanPreferencesService {
  static const String _storageKey = 'feasta_event_plan_preferences_v1';

  Future<EventPlanPreferences> load() async {
    final preferences = await SharedPreferences.getInstance();

    final raw = preferences.getString(_storageKey);

    if (raw == null || raw.trim().isEmpty) {
      return const EventPlanPreferences();
    }

    try {
      final decoded = jsonDecode(raw);

      if (decoded is! Map) {
        return const EventPlanPreferences();
      }

      return EventPlanPreferences.fromJson(Map<String, dynamic>.from(decoded));
    } catch (_) {
      return const EventPlanPreferences();
    }
  }

  Future<void> save(EventPlanPreferences value) async {
    final preferences = await SharedPreferences.getInstance();

    await preferences.setString(_storageKey, jsonEncode(value.toJson()));
  }
}

/// Every theme that can appear anywhere in FEASTA.
///
/// `Custom theme` and `Not sure yet` remain available regardless
/// of event type.
const List<String> feastaThemeOptions = <String>[
  'Colorful',
  'Cartoon',
  'Princess',
  'Superhero',
  'Romantic',
  'Rustic',
  'Garden',
  'Elegant',
  'Minimalist',
  'Boho',
  'Modern',
  'Tropical',
  'Traditional',
  'Pastel',
  'Classic',
  'Casual',
  'Formal',
  'Industrial',
  'School Colors',
  'Custom theme',
  'Not sure yet',
];

/// Event-aware theme recommendations.
///
/// These are presentation recommendations only. Customers may still
/// choose any theme from [feastaThemeOptions].
const Map<String, List<String>> feastaEventThemeSuggestions =
    <String, List<String>>{
      'Birthday': <String>[
        'Colorful',
        'Cartoon',
        'Princess',
        'Superhero',
        'Garden',
        'Tropical',
        'Minimalist',
        'Modern',
      ],
      'Wedding': <String>[
        'Elegant',
        'Romantic',
        'Rustic',
        'Garden',
        'Boho',
        'Modern',
        'Traditional',
        'Minimalist',
      ],
      'Anniversary': <String>[
        'Romantic',
        'Elegant',
        'Garden',
        'Classic',
        'Minimalist',
        'Modern',
      ],
      'Reunion': <String>[
        'Rustic',
        'Garden',
        'Casual',
        'Tropical',
        'Traditional',
        'Modern',
      ],
      'Corporate': <String>[
        'Modern',
        'Minimalist',
        'Formal',
        'Elegant',
        'Industrial',
        'Classic',
      ],
      'Baptism': <String>[
        'Pastel',
        'Elegant',
        'Garden',
        'Traditional',
        'Minimalist',
        'Classic',
      ],
      'Graduation': <String>[
        'School Colors',
        'Modern',
        'Elegant',
        'Minimalist',
        'Garden',
        'Classic',
      ],
      'Other': <String>[
        'Garden',
        'Rustic',
        'Elegant',
        'Minimalist',
        'Boho',
        'Modern',
        'Tropical',
        'Traditional',
      ],
    };

List<String> feastaSuggestedThemesForEvent(String eventType) {
  final suggestions =
      feastaEventThemeSuggestions[eventType] ??
      feastaEventThemeSuggestions['Other']!;

  return List<String>.unmodifiable(suggestions);
}

List<String> feastaOtherThemesForEvent(String eventType) {
  final suggested = feastaSuggestedThemesForEvent(eventType).toSet();

  return feastaThemeOptions
      .where(
        (theme) =>
            !suggested.contains(theme) &&
            theme != 'Custom theme' &&
            theme != 'Not sure yet',
      )
      .toList(growable: false);
}

const Set<String> feastaThemeRelevantCategories = <String>{
  'catering',
  'catering_service',
  'photography',
  'photo',
  'videography',
  'video',
  'event_styling',
  'styling',
  'venue',
  'venue_provider',
  'cake',
  'cake_provider',
  'entertainment',
  'rental',
  'rentals',
};

String normalizeThemeText(String value) {
  return value.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), ' ').trim();
}
