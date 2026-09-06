import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';

import '../../../../shared/models/customer_address_model.dart';
import 'package:flutter/foundation.dart';

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
    if (trimmedQuery.length < 2) return const <PlaceSearchResult>[];

    final response = await _call('searchPlaces', <String, dynamic>{
      'query': trimmedQuery,
    });

    if (response is! List) {
      throw const MapsApiException(
        'We could not read the location suggestions. Please try again.',
      );
    }

    return response
        .whereType<Map>()
        .map((item) => PlaceSearchResult.fromMap(_castMap(item)))
        .where((item) => item.placeId.isNotEmpty)
        .toList(growable: false);
  }

  Future<CustomerAddressModel> reverseGeocode({
    required double latitude,
    required double longitude,
    String? addressLabel,
  }) async {
    final response = await _callMap('reverseGeocode', <String, dynamic>{
      'latitude': latitude,
      'longitude': longitude,
    });

    return CustomerAddressModel.fromCallableMap(<String, dynamic>{
      ...response,
      if (addressLabel != null && addressLabel.trim().isNotEmpty)
        'addressLabel': addressLabel.trim(),
    });
  }

  Future<CustomerAddressModel> getPlaceDetails(String placeId) async {
    final normalizedPlaceId = placeId.trim();
    if (normalizedPlaceId.isEmpty) {
      throw const MapsApiException(
        'This location could not be opened. Please choose another result.',
      );
    }

    final response = await _callMap('getPlaceDetails', <String, dynamic>{
      'placeId': normalizedPlaceId,
    });

    return CustomerAddressModel.fromCallableMap(<String, dynamic>{
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
    final response = await _callMap('getDirections', <String, dynamic>{
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
    } on FirebaseFunctionsException catch (error) {
      debugPrint(
        '[MapsApiService] '
        'function=$functionName '
        'code=${error.code} '
        'message=${error.message} '
        'details=${error.details}',
      );

      throw MapsApiException(
        'Firebase ${error.code}: ${error.message ?? 'No message'}',
      );
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
    return 'Location services are temporarily unavailable. Please try again.';
  }

  switch (exception.code) {
    case 'unauthenticated':
      return 'Location search is temporarily unavailable. Please try again.';
    case 'permission-denied':
      return 'Location search is not available right now. Please try again.';
    case 'not-found':
      return 'No matching location was found.';
    case 'invalid-argument':
      return 'Please check the location details and try again.';
    case 'deadline-exceeded':
      return 'The location request timed out. Please try again.';
    case 'resource-exhausted':
      return 'Too many location requests. Please wait a moment and try again.';
    case 'failed-precondition':
      return 'Location services are not configured correctly right now.';
    case 'unavailable':
    case 'internal':
      return 'Unable to load location results. Please try again.';
    default:
      if (message.isNotEmpty && message.toUpperCase() != 'UNAUTHENTICATED') {
        return message;
      }
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
