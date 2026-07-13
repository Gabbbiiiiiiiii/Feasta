import 'package:cloud_firestore/cloud_firestore.dart';

class AdminUser {
  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String phoneNumber;
  final String role;
  final String? profileImageUrl;

  final bool isEmailVerified;
  final bool isPhoneVerified;
  final bool isActive;
  final bool isBlocked;

  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? lastLoginAt;

  final String? providerId;
  final String? businessName;
  final String? providerServiceType;
  final String? providerCategory;
  final String? verificationStatus;

  const AdminUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phoneNumber,
    required this.role,
    required this.profileImageUrl,
    required this.isEmailVerified,
    required this.isPhoneVerified,
    required this.isActive,
    required this.isBlocked,
    required this.createdAt,
    required this.updatedAt,
    required this.lastLoginAt,
    this.providerId,
    this.businessName,
    this.providerServiceType,
    this.providerCategory,
    this.verificationStatus,
  });

  String get fullName {
    final value = '$firstName $lastName'.trim();
    return value.isEmpty ? 'Unnamed user' : value;
  }

  String get initials {
    final first = firstName.trim();
    final last = lastName.trim();

    if (first.isNotEmpty && last.isNotEmpty) {
      return '${first[0]}${last[0]}'.toUpperCase();
    }

    if (first.isNotEmpty) {
      return first[0].toUpperCase();
    }

    if (email.isNotEmpty) {
      return email[0].toUpperCase();
    }

    return 'U';
  }

  bool get isProvider => role == 'provider';

  bool get isCustomer => role == 'customer';

  bool get isAdministrator => role == 'admin';

  String get accountStatus {
    if (isBlocked) return 'blocked';
    if (!isActive) return 'disabled';
    return 'active';
  }

  AdminUser copyWith({
    String? providerId,
    String? businessName,
    String? providerServiceType,
    String? providerCategory,
    String? verificationStatus,
  }) {
    return AdminUser(
      id: id,
      firstName: firstName,
      lastName: lastName,
      email: email,
      phoneNumber: phoneNumber,
      role: role,
      profileImageUrl: profileImageUrl,
      isEmailVerified: isEmailVerified,
      isPhoneVerified: isPhoneVerified,
      isActive: isActive,
      isBlocked: isBlocked,
      createdAt: createdAt,
      updatedAt: updatedAt,
      lastLoginAt: lastLoginAt,
      providerId: providerId ?? this.providerId,
      businessName: businessName ?? this.businessName,
      providerServiceType:
          providerServiceType ?? this.providerServiceType,
      providerCategory: providerCategory ?? this.providerCategory,
      verificationStatus:
          verificationStatus ?? this.verificationStatus,
    );
  }

  factory AdminUser.fromDocument(
    DocumentSnapshot<Map<String, dynamic>> document,
  ) {
    final data = document.data() ?? const <String, dynamic>{};

    return AdminUser(
      id: document.id,
      firstName: _stringValue(data['firstName']),
      lastName: _stringValue(data['lastName']),
      email: _stringValue(data['email']),
      phoneNumber: _stringValue(data['phoneNumber']),
      role: _stringValue(data['role']).toLowerCase(),
      profileImageUrl: _nullableString(data['profileImageUrl']),
      isEmailVerified: _boolValue(data['isEmailVerified']),
      isPhoneVerified: _boolValue(data['isPhoneVerified']),
      isActive: _boolValue(
        data['isActive'],
        defaultValue: true,
      ),
      isBlocked: _boolValue(data['isBlocked']),
      createdAt: _dateValue(data['createdAt']),
      updatedAt: _dateValue(data['updatedAt']),
      lastLoginAt: _dateValue(data['lastLoginAt']),
    );
  }

  static String _stringValue(dynamic value) {
    return value?.toString().trim() ?? '';
  }

  static String? _nullableString(dynamic value) {
    final result = value?.toString().trim();

    if (result == null || result.isEmpty) {
      return null;
    }

    return result;
  }

  static bool _boolValue(
    dynamic value, {
    bool defaultValue = false,
  }) {
    if (value is bool) return value;
    if (value is num) return value != 0;

    if (value is String) {
      final normalized = value.trim().toLowerCase();

      if (normalized == 'true') return true;
      if (normalized == 'false') return false;
    }

    return defaultValue;
  }

  static DateTime? _dateValue(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;

    if (value is int) {
      return DateTime.fromMillisecondsSinceEpoch(value);
    }

    if (value is String) {
      return DateTime.tryParse(value);
    }

    return null;
  }
}