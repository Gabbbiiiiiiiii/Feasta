/// Normalized locality supplied by an address picker or a provider's service area.
typedef Municipality = ({String name, String? province});

Municipality? normalizeBestFitArea(String value, {String? province}) {
  String normalize(String text) => text
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[-‐‑]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ');

  final parts = value.split(RegExp(r'[,|]')).map(normalize).toList();
  final name = parts.first
      .replaceFirst(RegExp(r'^(city|municipality|town) of '), '')
      .replaceFirst(RegExp(r' city$'), '')
      .trim();
  if (!RegExp(r'\p{L}', unicode: true).hasMatch(name)) return null;

  final provinces = <String>{};
  for (final part in [
    ...parts.skip(1),
    if (province != null) normalize(province),
  ]) {
    final qualifier = part.replaceFirst(RegExp(r'^province of '), '');
    if (qualifier.isEmpty ||
        const {'philippines', 'ph', 'phl'}.contains(qualifier) ||
        RegExp(
          r'\bregion\b|^(western|central|eastern) visayas$|^metro manila$',
        ).hasMatch(qualifier)) {
      continue;
    }
    provinces.add(qualifier);
  }

  if (provinces.length > 1) return null;
  return (name: name, province: provinces.firstOrNull);
}

/// A short locality label can match a qualified pin, but conflicting provinces
/// must never match just because their municipalities have the same name.
bool sameMunicipality(Municipality? left, Municipality? right) =>
    left != null &&
    right != null &&
    left.name == right.name &&
    (left.province == null ||
        right.province == null ||
        left.province == right.province);
