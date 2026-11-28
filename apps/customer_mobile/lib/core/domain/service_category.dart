class ServiceCategory {
  const ServiceCategory({
    required this.code,
    required this.name,
    required this.serviceType,
    required this.status,
  });

  final String code;
  final String name;
  final String serviceType;
  final String status;

  bool get isActive => status == 'active';

  factory ServiceCategory.fromMap(
    String documentId,
    Map<String, dynamic> data,
  ) {
    final code = documentId.trim();
    final name = (data['name'] as String? ?? '').trim();
    final serviceType = (data['serviceType'] as String? ?? '').trim();
    final status = (data['status'] as String? ?? '').trim();

    if (!isServiceCategoryCode(code)) {
      throw FormatException('Invalid service category code: $code');
    }

    if (name.isEmpty) {
      throw FormatException('Service category $code has no name.');
    }

    if (serviceType != 'catering' && serviceType != 'addon') {
      throw FormatException(
        'Service category $code has an invalid service type.',
      );
    }

    if (status != 'active' && status != 'discontinued') {
      throw FormatException('Service category $code has an invalid status.');
    }

    return ServiceCategory(
      code: code,
      name: name,
      serviceType: serviceType,
      status: status,
    );
  }
}

final RegExp _serviceCategoryCodePattern = RegExp(
  r'^[a-z0-9]+(?:_[a-z0-9]+)*$',
);

bool isServiceCategoryCode(Object? value) {
  if (value is! String) {
    return false;
  }

  return value.length >= 2 &&
      value.length <= 100 &&
      _serviceCategoryCodePattern.hasMatch(value);
}

String humanizeServiceCategoryCode(String code) {
  final normalized = code.trim();

  if (normalized.isEmpty) {
    return 'Service';
  }

  return normalized
      .split('_')
      .where((part) => part.isNotEmpty)
      .map(
        (part) => part.length == 1
            ? part.toUpperCase()
            : '${part[0].toUpperCase()}${part.substring(1)}',
      )
      .join(' ');
}
