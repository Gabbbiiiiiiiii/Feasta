import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';

import '../models/customer_address_model.dart';

class PlaceSearchResult {
  final String placeId;
  final String mainText;
  final String secondaryText;
  final String fullAddress;

  const PlaceSearchResult({
    required this.placeId,
    required this.mainText,
    required this.secondaryText,
    required this.fullAddress,
  });

  factory PlaceSearchResult.fromMap(Map<String, dynamic> map) {
    return PlaceSearchResult(
      placeId: _stringFromValue(map['placeId']),
      mainText: _stringFromValue(map['mainText']),
      secondaryText: _stringFromValue(map['secondaryText']),
      fullAddress: _stringFromValue(map['fullAddress']),
    );
  }
}

class DirectionsResult {
  final String distanceText;
  final int distanceMeters;
  final String durationText;
  final int durationSeconds;
  final String encodedPolyline;

  const DirectionsResult({
    required this.distanceText,
    required this.distanceMeters,
    required this.durationText,
    required this.durationSeconds,
    required this.encodedPolyline,
  });

  factory DirectionsResult.fromMap(Map<String, dynamic> map) {
    return DirectionsResult(
      distanceText: _stringFromValue(map['distanceText']),
      distanceMeters: _intFromValue(map['distanceMeters']),
      durationText: _stringFromValue(map['durationText']),
      durationSeconds: _intFromValue(map['durationSeconds']),
      encodedPolyline: _stringFromValue(map['encodedPolyline']),
    );
  }
}

class MapsApiException implements Exception {
  final String message;

  const MapsApiException(this.message);

  @override
  String toString() => message;
}

class MapsApiService {
  static const String _region = 'asia-southeast1';
  static const Duration _timeout = Duration(seconds: 14);

  final FirebaseFunctions functions;

  MapsApiService({FirebaseFunctions? functions})
    : functions = functions ?? FirebaseFunctions.instanceFor(region: _region);

  Future<List<PlaceSearchResult>> searchPlaces(String query) async {
    final trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) return [];

    final response = await _call('searchPlaces', {'query': trimmedQuery});

    if (response is! List) {
      throw const MapsApiException(
        'We could not read the location suggestions. Please try again.',
      );
    }

    return response
        .whereType<Map>()
        .map((item) => PlaceSearchResult.fromMap(_castMap(item)))
        .where((item) => item.placeId.isNotEmpty)
        .toList();
  }

  Future<CustomerAddressModel> reverseGeocode({
    required double latitude,
    required double longitude,
    String? addressLabel,
  }) async {
    final response = await _callMap('reverseGeocode', {
      'latitude': latitude,
      'longitude': longitude,
    });

    return CustomerAddressModel.fromCallableMap({
      ...response,
      if (addressLabel != null && addressLabel.trim().isNotEmpty)
        'addressLabel': addressLabel,
    });
  }

  Future<CustomerAddressModel> getPlaceDetails(String placeId) async {
    final response = await _callMap('getPlaceDetails', {'placeId': placeId});

    return CustomerAddressModel.fromCallableMap({
      ...response,
      'addressLabel': _labelFromAddressParts(response),
    });
  }

  Future<DirectionsResult> getDirections({
    required double originLat,
    required double originLng,
    required double destinationLat,
    required double destinationLng,
  }) async {
    final response = await _callMap('getDirections', {
      'originLat': originLat,
      'originLng': originLng,
      'destinationLat': destinationLat,
      'destinationLng': destinationLng,
    });

    return DirectionsResult.fromMap(response);
  }

  Future<Map<String, dynamic>> _callMap(
    String functionName,
    Map<String, dynamic> data,
  ) async {
    final response = await _call(functionName, data);

    if (response is Map) return _castMap(response);

    throw const MapsApiException(
      'We could not read the location response. Please try again.',
    );
  }

  Future<dynamic> _call(String functionName, Map<String, dynamic> data) async {
    try {
      final callable = functions.httpsCallable(
        functionName,
        options: HttpsCallableOptions(timeout: _timeout),
      );
      final result = await callable.call<dynamic>(data);
      return result.data;
    } on FirebaseFunctionsException catch (e) {
      throw MapsApiException(_friendlyFunctionMessage(e));
    } on TimeoutException {
      throw const MapsApiException(
        'The location request timed out. Check your connection and try again.',
      );
    } on MapsApiException {
      rethrow;
    } catch (_) {
      throw const MapsApiException(
        'Unable to connect to location services. Check your internet and try again.',
      );
    }
  }
}

Map<String, dynamic> _castMap(Map<dynamic, dynamic> map) {
  return map.map((key, value) => MapEntry(key.toString(), value));
}

String _friendlyFunctionMessage(FirebaseFunctionsException exception) {
  final message = exception.message?.trim() ?? '';
  if (_containsGoogleApiKeyRestrictionMessage(message)) {
    return 'Unable to load address. Please try again or enter manually.';
  }

  if (message.isNotEmpty) {
    if (exception.code == 'unavailable' || exception.code == 'internal') {
      return 'Unable to load address. Please try again or enter manually.';
    }

    return message;
  }

  switch (exception.code) {
    case 'not-found':
      return 'No matching location was found.';
    case 'invalid-argument':
      return 'Please check the location details and try again.';
    case 'deadline-exceeded':
      return 'The location request timed out. Please try again.';
    case 'unavailable':
      return 'Unable to load address. Please try again or enter manually.';
    default:
      return 'Unable to complete the location request. Please try again.';
  }
}

bool _containsGoogleApiKeyRestrictionMessage(String message) {
  final lowerMessage = message.toLowerCase();
  return lowerMessage.contains('api key') ||
      lowerMessage.contains('not authorized') ||
      lowerMessage.contains('empty referrer') ||
      lowerMessage.contains('request_denied') ||
      lowerMessage.contains('ip address');
}

String _labelFromAddressParts(Map<String, dynamic> map) {
  final streetName = _stringFromValue(map['streetName']);
  final barangay = _stringFromValue(map['barangay']);
  final city = _stringFromValue(map['city']);

  if (streetName.isNotEmpty) return streetName;
  if (barangay.isNotEmpty) return barangay;
  if (city.isNotEmpty) return city;
  return CustomerAddressModel.defaultOrmoc.addressLabel;
}

String _stringFromValue(dynamic value) {
  if (value == null) return '';
  return value.toString().trim();
}

int _intFromValue(dynamic value) {
  if (value is int) return value;
  if (value is double) return value.round();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}
