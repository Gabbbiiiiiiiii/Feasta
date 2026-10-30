import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../shared/models/customer_address_model.dart';

class LocationServiceException implements Exception {
  final String message;

  const LocationServiceException(this.message);

  @override
  String toString() => message;
}

class LocationService {
  static const CameraPosition defaultCameraPosition = CameraPosition(
    target: LatLng(11.0064, 124.6075),
    zoom: 16,
  );

  Future<Position> getCurrentPosition() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();

    if (!serviceEnabled) {
      throw const LocationServiceException(
        'Location services are turned off. Turn them on or enter your address manually.',
      );
    }

    var permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      throw const LocationServiceException(
        'Location permission was denied. You can still enter your address manually.',
      );
    }

    if (permission == LocationPermission.deniedForever) {
      throw const LocationServiceException(
        'Location permission is permanently denied. Enable it in your phone settings or enter your address manually.',
      );
    }

    try {
      return Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.bestForNavigation,
          timeLimit: Duration(seconds: 20),
        ),
      );
    } catch (_) {
      throw const LocationServiceException(
        'Unable to get your current location. Check your GPS signal or enter your address manually.',
      );
    }
  }

  LatLng latLngFromAddress(CustomerAddressModel address) {
    if (!address.hasCoordinates) {
      return defaultCameraPosition.target;
    }

    return LatLng(address.latitude, address.longitude);
  }

  CameraPosition cameraPositionForAddress(CustomerAddressModel address) {
    return CameraPosition(target: latLngFromAddress(address), zoom: 18);
  }

  Future<void> animateToAddress({
    required GoogleMapController controller,
    required CustomerAddressModel address,
    double zoom = 18,
  }) async {
    await controller.animateCamera(
      CameraUpdate.newCameraPosition(
        CameraPosition(target: latLngFromAddress(address), zoom: zoom),
      ),
    );
  }
}
