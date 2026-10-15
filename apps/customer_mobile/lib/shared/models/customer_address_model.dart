import 'dart:convert';

class CustomerAddressModel {
  final String id;
  final String addressLabel;
  final String fullAddress;
  final String streetName;
  final String barangay;
  final String city;
  final String province;
  final String postalCode;
  final String country;
  final double latitude;
  final double longitude;
  final bool isDefault;
  final DateTime createdAt;
  final String houseNumber;
  final String notes;

  const CustomerAddressModel({
    required this.id,
    required this.addressLabel,
    required this.fullAddress,
    required this.streetName,
    required this.barangay,
    required this.city,
    required this.province,
    required this.postalCode,
    required this.country,
    required this.latitude,
    required this.longitude,
    required this.isDefault,
    required this.createdAt,
    this.houseNumber = '',
    this.notes = '',
  });

  static final CustomerAddressModel defaultOrmoc = CustomerAddressModel(
    id: 'default_ormoc_city',
    addressLabel: 'Ormoc City',
    fullAddress: 'Ormoc City, Leyte, Philippines',
    streetName: '',
    barangay: '',
    city: 'Ormoc City',
    province: 'Leyte',
    postalCode: '',
    country: 'Philippines',
    latitude: 11.0064,
    longitude: 124.6075,
    isDefault: true,
    createdAt: DateTime.fromMillisecondsSinceEpoch(0),
  );

  bool get hasCoordinates {
    return latitude != 0 && longitude != 0;
  }

  String get displayTitle {
    final label = addressLabel.trim();
    if (label.isNotEmpty) return label;

    if (streetName.trim().isNotEmpty) return streetName.trim();
    if (barangay.trim().isNotEmpty) return barangay.trim();
    if (city.trim().isNotEmpty) return city.trim();

    return CustomerAddressModel.defaultOrmoc.addressLabel;
  }

  String get displaySubtitle {
    final parts = [
      streetName,
      barangay,
      city,
      province,
    ].map((value) => value.trim()).where((value) => value.isNotEmpty).toList();

    if (parts.isNotEmpty) return parts.join(', ');
    if (fullAddress.trim().isNotEmpty) return fullAddress.trim();

    return 'Ormoc City, Leyte';
  }

  String get shortLocation {
    final parts = [
      streetName,
      city,
    ].map((value) => value.trim()).where((value) => value.isNotEmpty).toList();

    if (parts.isNotEmpty) return parts.join(', ');
    return displaySubtitle;
  }

  CustomerAddressModel copyWith({
    String? id,
    String? addressLabel,
    String? fullAddress,
    String? streetName,
    String? barangay,
    String? city,
    String? province,
    String? postalCode,
    String? country,
    double? latitude,
    double? longitude,
    bool? isDefault,
    DateTime? createdAt,
    String? houseNumber,
    String? notes,
  }) {
    return CustomerAddressModel(
      id: id ?? this.id,
      addressLabel: addressLabel ?? this.addressLabel,
      fullAddress: fullAddress ?? this.fullAddress,
      streetName: streetName ?? this.streetName,
      barangay: barangay ?? this.barangay,
      city: city ?? this.city,
      province: province ?? this.province,
      postalCode: postalCode ?? this.postalCode,
      country: country ?? this.country,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      isDefault: isDefault ?? this.isDefault,
      createdAt: createdAt ?? this.createdAt,
      houseNumber: houseNumber ?? this.houseNumber,
      notes: notes ?? this.notes,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'addressLabel': addressLabel,
      'fullAddress': fullAddress,
      'streetName': streetName,
      'barangay': barangay,
      'city': city,
      'province': province,
      'postalCode': postalCode,
      'country': country,
      'latitude': latitude,
      'longitude': longitude,
      'isDefault': isDefault,
      'createdAt': createdAt.toIso8601String(),
      'houseNumber': houseNumber,
      'notes': notes,
    };
  }

  String toJson() {
    return jsonEncode(toMap());
  }

  factory CustomerAddressModel.fromMap(Map<String, dynamic> map) {
    final createdAtValue = map['createdAt'];

    return CustomerAddressModel(
      id: _stringFromValue(map['id'], fallback: _newAddressId()),
      addressLabel: _bestAddressLabel(map),
      fullAddress: _stringFromValue(map['fullAddress']),
      streetName: _stringFromValue(map['streetName']),
      barangay: _stringFromValue(map['barangay']),
      city: _stringFromValue(
        map['city'],
        fallback: CustomerAddressModel.defaultOrmoc.city,
      ),
      province: _stringFromValue(
        map['province'],
        fallback: CustomerAddressModel.defaultOrmoc.province,
      ),
      postalCode: _stringFromValue(map['postalCode']),
      country: _stringFromValue(
        map['country'],
        fallback: CustomerAddressModel.defaultOrmoc.country,
      ),
      latitude: _doubleFromValue(
        map['latitude'],
        fallback: CustomerAddressModel.defaultOrmoc.latitude,
      ),
      longitude: _doubleFromValue(
        map['longitude'],
        fallback: CustomerAddressModel.defaultOrmoc.longitude,
      ),
      isDefault: _boolFromValue(map['isDefault']),
      createdAt: _dateTimeFromValue(createdAtValue),
      houseNumber: _stringFromValue(map['houseNumber']),
      notes: _stringFromValue(map['notes']),
    );
  }

  factory CustomerAddressModel.fromJson(String source) {
    return CustomerAddressModel.fromMap(
      Map<String, dynamic>.from(jsonDecode(source)),
    );
  }

  factory CustomerAddressModel.fromCallableMap(Map<String, dynamic> map) {
    final normalizedMap = Map<String, dynamic>.from(map);
    normalizedMap['addressLabel'] = _bestAddressLabel(normalizedMap);

    return CustomerAddressModel.fromMap({
      ...normalizedMap,
      'id': normalizedMap['id'] ?? _newAddressId(),
      'isDefault': normalizedMap['isDefault'] ?? false,
      'createdAt':
          normalizedMap['createdAt'] ?? DateTime.now().toIso8601String(),
    });
  }
}

String newCustomerAddressId() {
  return _newAddressId();
}

String _newAddressId() {
  return DateTime.now().microsecondsSinceEpoch.toString();
}

String _stringFromValue(dynamic value, {String fallback = ''}) {
  if (value == null) return fallback;
  final text = value.toString().trim();
  return text.isEmpty ? fallback : text;
}

double _doubleFromValue(dynamic value, {double fallback = 0}) {
  if (value == null) return fallback;
  if (value is double) return value;
  if (value is int) return value.toDouble();
  return double.tryParse(value.toString()) ?? fallback;
}

bool _boolFromValue(dynamic value) {
  if (value is bool) return value;
  if (value is String) return value.toLowerCase() == 'true';
  if (value is num) return value != 0;
  return false;
}

DateTime _dateTimeFromValue(dynamic value) {
  if (value is DateTime) return value;
  if (value is String) {
    return DateTime.tryParse(value) ?? DateTime.now();
  }

  return DateTime.now();
}

String _bestAddressLabel(Map<String, dynamic> map) {
  final existingLabel = _stringFromValue(map['addressLabel']);
  if (existingLabel.isNotEmpty && !_isOldPlaceholderLabel(existingLabel)) {
    return existingLabel;
  }

  final streetName = _stringFromValue(map['streetName']);
  if (streetName.isNotEmpty) return streetName;

  final barangay = _stringFromValue(map['barangay']);
  if (barangay.isNotEmpty) return barangay;

  final city = _stringFromValue(map['city']);
  if (city.isNotEmpty) return city;

  return CustomerAddressModel.defaultOrmoc.addressLabel;
}

bool _isOldPlaceholderLabel(String label) {
  final normalized = label.toLowerCase().replaceAll(RegExp(r'[^a-z]'), '');
  return normalized.startsWith('pin') && normalized.endsWith('location');
}
