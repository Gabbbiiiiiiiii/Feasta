import 'package:shared_preferences/shared_preferences.dart';

import '../../../../shared/models/customer_address_model.dart';

class CustomerAddressStorageService {
  static const String _selectedAddressIdKey =
      'feasta_selected_customer_address_id';
  static const String _selectedAddressKey = 'feasta_selected_customer_address';
  static const String _savedAddressesKey = 'feasta_saved_customer_addresses';
  static const String _preferredMapTypeKey = 'feasta_preferred_map_type';

  Future<CustomerAddressModel?> getSelectedAddress() async {
    final prefs = await SharedPreferences.getInstance();
    final selectedId = prefs.getString(_selectedAddressIdKey);
    final savedAddresses = await getSavedAddresses();

    if (selectedId != null && selectedId.isNotEmpty) {
      for (final address in savedAddresses) {
        if (address.id == selectedId) return address;
      }
    }

    for (final address in savedAddresses) {
      if (address.isDefault) return address;
    }

    final rawSelectedAddress = prefs.getString(_selectedAddressKey);
    if (rawSelectedAddress == null || rawSelectedAddress.trim().isEmpty) {
      return null;
    }

    try {
      return CustomerAddressModel.fromJson(rawSelectedAddress);
    } catch (_) {
      await prefs.remove(_selectedAddressKey);
      return null;
    }
  }

  Future<CustomerAddressModel> getSelectedOrDefault() async {
    return await getSelectedAddress() ?? CustomerAddressModel.defaultOrmoc;
  }

  Future<List<CustomerAddressModel>> getSavedAddresses() async {
    final prefs = await SharedPreferences.getInstance();
    final rawAddresses = prefs.getStringList(_savedAddressesKey) ?? [];
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
    final prefs = await SharedPreferences.getInstance();
    final addresses = await getSavedAddresses();
    final nextAddresses = addresses
        .where((address) => address.id != addressId)
        .toList();

    if (nextAddresses.isNotEmpty &&
        !nextAddresses.any((address) => address.isDefault)) {
      nextAddresses[0] = nextAddresses[0].copyWith(isDefault: true);
      await prefs.setString(_selectedAddressIdKey, nextAddresses[0].id);
      await prefs.setString(_selectedAddressKey, nextAddresses[0].toJson());
    } else if (nextAddresses.isEmpty) {
      await prefs.remove(_selectedAddressIdKey);
      await prefs.remove(_selectedAddressKey);
    }

    await _writeSavedAddresses(_normalizeDefaults(nextAddresses));
  }

  Future<void> setDefaultAddress(String addressId) async {
    final prefs = await SharedPreferences.getInstance();
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
    await prefs.setString(_selectedAddressIdKey, addressId);

    if (selectedAddress != null) {
      await prefs.setString(_selectedAddressKey, selectedAddress.toJson());
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
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_selectedAddressIdKey);
    await prefs.remove(_selectedAddressKey);
  }

  Future<void> _writeSavedAddresses(
    List<CustomerAddressModel> addresses,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _savedAddressesKey,
      addresses.map((address) => address.toJson()).toList(),
    );
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
