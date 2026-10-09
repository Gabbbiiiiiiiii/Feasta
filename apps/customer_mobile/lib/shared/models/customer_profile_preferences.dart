import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'customer_address_model.dart';

enum CustomerPreferredContactMethod { inAppMessage, sms, phoneCall, email }

extension CustomerPreferredContactMethodLabel
    on CustomerPreferredContactMethod {
  String get storageValue => switch (this) {
    CustomerPreferredContactMethod.inAppMessage => 'in_app_message',
    CustomerPreferredContactMethod.sms => 'sms',
    CustomerPreferredContactMethod.phoneCall => 'phone_call',
    CustomerPreferredContactMethod.email => 'email',
  };

  String get label => switch (this) {
    CustomerPreferredContactMethod.inAppMessage => 'In-app message',
    CustomerPreferredContactMethod.sms => 'SMS',
    CustomerPreferredContactMethod.phoneCall => 'Phone call',
    CustomerPreferredContactMethod.email => 'Email',
  };

  static CustomerPreferredContactMethod fromStorage(String? value) {
    return switch (value) {
      'sms' => CustomerPreferredContactMethod.sms,
      'phone_call' => CustomerPreferredContactMethod.phoneCall,
      'email' => CustomerPreferredContactMethod.email,
      _ => CustomerPreferredContactMethod.inAppMessage,
    };
  }
}

class CustomerProfilePreferences {
  const CustomerProfilePreferences({
    this.streetAddress = '',
    this.barangay = '',
    this.city = '',
    this.province = '',
    this.postalCode = '',
    this.preferredContactMethod = CustomerPreferredContactMethod.inAppMessage,
    this.useAsDefaultEventLocation = false,
  });

  final String streetAddress;
  final String barangay;
  final String city;
  final String province;
  final String postalCode;
  final CustomerPreferredContactMethod preferredContactMethod;
  final bool useAsDefaultEventLocation;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'streetAddress': streetAddress,
      'barangay': barangay,
      'city': city,
      'province': province,
      'postalCode': postalCode,
      'preferredContactMethod': preferredContactMethod.storageValue,
      'useAsDefaultEventLocation': useAsDefaultEventLocation,
    };
  }

  factory CustomerProfilePreferences.fromJson(Map<String, dynamic> json) {
    return CustomerProfilePreferences(
      streetAddress: json['streetAddress']?.toString() ?? '',
      barangay: json['barangay']?.toString() ?? '',
      city: json['city']?.toString() ?? '',
      province: json['province']?.toString() ?? '',
      postalCode: json['postalCode']?.toString() ?? '',
      preferredContactMethod: CustomerPreferredContactMethodLabel.fromStorage(
        json['preferredContactMethod']?.toString(),
      ),
      useAsDefaultEventLocation: json['useAsDefaultEventLocation'] == true,
    );
  }

  CustomerAddressModel toDefaultEventAddress() {
    final street = streetAddress.trim();
    final barangayValue = barangay.trim();
    final cityValue = city.trim();
    final provinceValue = province.trim();
    final postalValue = postalCode.trim();

    final parts = <String>[
      street,
      barangayValue,
      cityValue,
      provinceValue,
      postalValue,
    ].where((part) => part.isNotEmpty).toList(growable: false);

    return CustomerAddressModel(
      id: 'profile_default_event_location',
      addressLabel: street.isNotEmpty
          ? street
          : barangayValue.isNotEmpty
          ? barangayValue
          : cityValue.isNotEmpty
          ? cityValue
          : 'Default event location',
      fullAddress: parts.join(', '),
      streetName: street,
      barangay: barangayValue,
      city: cityValue,
      province: provinceValue,
      postalCode: postalValue,
      country: 'Philippines',
      latitude: 0,
      longitude: 0,
      isDefault: true,
      createdAt: DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}

class CustomerProfilePreferencesService {
  static const String _key = 'feasta_customer_profile_preferences_v1';

  Future<CustomerProfilePreferences> load() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_key);

    if (raw == null || raw.trim().isEmpty) {
      return const CustomerProfilePreferences();
    }

    try {
      final decoded = jsonDecode(raw);

      if (decoded is! Map) {
        return const CustomerProfilePreferences();
      }

      return CustomerProfilePreferences.fromJson(
        Map<String, dynamic>.from(decoded),
      );
    } catch (_) {
      return const CustomerProfilePreferences();
    }
  }

  Future<void> save(CustomerProfilePreferences value) async {
    final preferences = await SharedPreferences.getInstance();

    await preferences.setString(_key, jsonEncode(value.toJson()));
  }

  Future<CustomerAddressModel?> loadDefaultEventAddress() async {
    final value = await load();

    if (!value.useAsDefaultEventLocation) {
      return null;
    }

    final address = value.toDefaultEventAddress();

    if (address.fullAddress.trim().isEmpty) {
      return null;
    }

    return address;
  }
}
