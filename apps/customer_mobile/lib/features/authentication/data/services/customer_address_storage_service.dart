import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../shared/models/customer_address_model.dart';

class CustomerAddressStorageService {
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  static const String _selectedAddressIdKey =
      'feasta_selected_customer_address_id';
  static const String _selectedAddressKey = 'feasta_selected_customer_address';
  static const String _savedAddressesKey = 'feasta_saved_customer_addresses';
  static const String _preferredMapTypeKey = 'feasta_preferred_map_type';

  Future<CustomerAddressModel?> getSelectedAddress() async {
    final prefs = await SharedPreferences.getInstance();
    final selectedId = await _readSecureOrMigrate(
      _selectedAddressIdKey,
      prefs.getString(_selectedAddressIdKey),
      prefs,
    );
    final savedAddresses = await getSavedAddresses();

    if (selectedId != null && selectedId.isNotEmpty) {
      for (final address in savedAddresses) {
        if (address.id == selectedId) return address;
      }
    }

    for (final address in savedAddresses) {
      if (address.isDefault) return address;
    }

    final rawSelectedAddress = await _readSecureOrMigrate(
      _selectedAddressKey,
      prefs.getString(_selectedAddressKey),
      prefs,
    );
    if (rawSelectedAddress == null || rawSelectedAddress.trim().isEmpty) {
      return null;
    }

    try {
      return CustomerAddressModel.fromJson(rawSelectedAddress);
    } catch (_) {
      await _secureStorage.delete(key: _selectedAddressKey);
      return null;
    }
  }

  Future<CustomerAddressModel> getSelectedOrDefault() async {
    return await getSelectedAddress() ?? CustomerAddressModel.defaultOrmoc;
  }

  Future<List<CustomerAddressModel>> getSavedAddresses() async {
    final prefs = await SharedPreferences.getInstance();
    final legacyAddresses = prefs.getStringList(_savedAddressesKey);
    final storedAddresses = await _readSecureOrMigrate(
      _savedAddressesKey,
      legacyAddresses == null ? null : jsonEncode(legacyAddresses),
      prefs,
    );
    final rawAddresses = _decodeAddressList(storedAddresses);
    final addresses = <CustomerAddressModel>[];

    for (final rawAddress in rawAddresses) {
      try {
        addresses.add(CustomerAddressModel.fromJson(rawAddress));
      } catch (_) {}
    }

    addresses.sort((a, b) {
      if (a.isDefault != b.isDefault) return a.isDefault ? -1 : 1;
      return b.createdAt.compareTo(a.createdAt);
    });

    return addresses;
  }

  Future<void> saveSelectedAddress(CustomerAddressModel address) async {
    await saveAddress(address.copyWith(isDefault: true));
    await setDefaultAddress(address.id);
  }

  Future<void> saveAddress(CustomerAddressModel address) async {
    final addresses = await getSavedAddresses();
    final existingDefault = addresses.any((item) => item.isDefault);
    final normalizedAddress = address.copyWith(
      isDefault: address.isDefault || !existingDefault,
      createdAt: address.createdAt,
    );

    final nextAddresses = [
      normalizedAddress,
      ...addresses.where((item) => item.id != normalizedAddress.id),
    ];

    await _writeSavedAddresses(_normalizeDefaults(nextAddresses));
  }

  Future<void> updateAddress(CustomerAddressModel address) async {
    final addresses = await getSavedAddresses();
    final nextAddresses = addresses
        .map((item) => item.id == address.id ? address : item)
        .toList();

    if (!nextAddresses.any((item) => item.id == address.id)) {
      nextAddresses.insert(0, address);
    }

    await _writeSavedAddresses(_normalizeDefaults(nextAddresses));
  }

  Future<void> deleteAddress(String addressId) async {
    final addresses = await getSavedAddresses();
    final nextAddresses = addresses
        .where((address) => address.id != addressId)
        .toList();

    if (nextAddresses.isNotEmpty &&
        !nextAddresses.any((address) => address.isDefault)) {
      nextAddresses[0] = nextAddresses[0].copyWith(isDefault: true);
      await _secureStorage.write(
        key: _selectedAddressIdKey,
        value: nextAddresses[0].id,
      );
      await _secureStorage.write(
        key: _selectedAddressKey,
        value: nextAddresses[0].toJson(),
      );
    } else if (nextAddresses.isEmpty) {
      await _secureStorage.delete(key: _selectedAddressIdKey);
      await _secureStorage.delete(key: _selectedAddressKey);
    }

    await _writeSavedAddresses(_normalizeDefaults(nextAddresses));
  }

  Future<void> setDefaultAddress(String addressId) async {
    final addresses = await getSavedAddresses();
    final nextAddresses = addresses.map((address) {
      return address.copyWith(isDefault: address.id == addressId);
    }).toList();
    CustomerAddressModel? selectedAddress;
    for (final address in nextAddresses) {
      if (address.id == addressId) {
        selectedAddress = address;
        break;
      }
    }

    await _writeSavedAddresses(nextAddresses);
    await _secureStorage.write(key: _selectedAddressIdKey, value: addressId);

    if (selectedAddress != null) {
      await _secureStorage.write(
        key: _selectedAddressKey,
        value: selectedAddress.toJson(),
      );
    }
  }

  Future<String> getPreferredMapType() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_preferredMapTypeKey) ?? 'normal';
  }

  Future<void> savePreferredMapType(String mapType) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_preferredMapTypeKey, mapType);
  }

  Future<void> clearSelectedAddress() async {
    await _secureStorage.delete(key: _selectedAddressIdKey);
    await _secureStorage.delete(key: _selectedAddressKey);
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_selectedAddressIdKey);
    await preferences.remove(_selectedAddressKey);
  }

  Future<void> _writeSavedAddresses(
    List<CustomerAddressModel> addresses,
  ) async {
    await _secureStorage.write(
      key: _savedAddressesKey,
      value: jsonEncode(addresses.map((address) => address.toJson()).toList()),
    );
  }

  Future<String?> _readSecureOrMigrate(
    String key,
    String? legacyValue,
    SharedPreferences preferences,
  ) async {
    final secureValue = await _secureStorage.read(key: key);
    if (secureValue != null) {
      if (legacyValue != null) await preferences.remove(key);
      return secureValue;
    }
    if (legacyValue == null || legacyValue.isEmpty) return null;
    await _secureStorage.write(key: key, value: legacyValue);
    await preferences.remove(key);
    return legacyValue;
  }

  List<String> _decodeAddressList(String? value) {
    if (value == null || value.isEmpty) return [];
    try {
      final decoded = jsonDecode(value);
      if (decoded is! List) return [];
      return decoded.whereType<String>().toList();
    } catch (_) {
      return [];
    }
  }

  List<CustomerAddressModel> _normalizeDefaults(
    List<CustomerAddressModel> addresses,
  ) {
    if (addresses.isEmpty) return [];

    final defaultIndex = addresses.indexWhere((address) => address.isDefault);
    if (defaultIndex == -1) {
      return [
        addresses.first.copyWith(isDefault: true),
        ...addresses
            .skip(1)
            .map((address) => address.copyWith(isDefault: false)),
      ];
    }

    return [
      for (var index = 0; index < addresses.length; index++)
        addresses[index].copyWith(isDefault: index == defaultIndex),
    ];
  }
}
