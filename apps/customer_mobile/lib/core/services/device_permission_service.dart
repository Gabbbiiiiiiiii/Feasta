import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DevicePermissionService {
  DevicePermissionService._();

  static const String _locationAskedKey = 'device_permission_location_asked';
  static const String _notificationAskedKey =
      'device_permission_notification_asked';

  static Future<void> requestCorePermissionsIfNeeded(
    BuildContext context, {
    bool requestLocation = true,
    bool requestNotifications = true,
  }) async {
    final prefs = await SharedPreferences.getInstance();

    final shouldAskLocation =
        requestLocation && !(prefs.getBool(_locationAskedKey) ?? false);

    final shouldAskNotifications = requestNotifications &&
        !(prefs.getBool(_notificationAskedKey) ?? false);

    if (!shouldAskLocation && !shouldAskNotifications) {
      return;
    }

    if (!context.mounted) return;

    final shouldRequest = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: const Text(
            'Device access',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          content: Text(_permissionMessage(
            location: shouldAskLocation,
            notifications: shouldAskNotifications,
          )),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Not now'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Continue'),
            ),
          ],
        );
      },
    );

    if (shouldAskLocation) {
      await prefs.setBool(_locationAskedKey, true);
    }

    if (shouldAskNotifications) {
      await prefs.setBool(_notificationAskedKey, true);
    }

    if (shouldRequest != true) {
      return;
    }

    if (shouldAskLocation) {
      await requestLocationPermission();
    }

    if (shouldAskNotifications) {
      await requestNotificationPermission();
    }
  }

  static String _permissionMessage({
    required bool location,
    required bool notifications,
  }) {
    if (location && notifications) {
      return 'Allow Feasta to use your location for nearby services and send notifications for booking updates.';
    }

    if (location) {
      return 'Allow Feasta to use your location for nearby services.';
    }

    return 'Allow Feasta to send notifications for booking updates.';
  }

  static Future<bool> requestLocationPermission() async {
    var permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }

  static Future<bool> requestNotificationPermission() async {
    final status = await Permission.notification.status;

    if (status.isGranted) {
      return true;
    }

    final result = await Permission.notification.request();
    return result.isGranted;
  }

  static Future<Position?> currentLocation() async {
    final hasPermission = await requestLocationPermission();

    if (!hasPermission) {
      return null;
    }

    final serviceEnabled = await Geolocator.isLocationServiceEnabled();

    if (!serviceEnabled) {
      return null;
    }

    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        timeLimit: Duration(seconds: 15),
      ),
    );
  }
}
