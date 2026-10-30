import 'package:feasta/features/authentication/data/services/location_service.dart';
import 'package:geolocator/geolocator.dart';
import 'dart:async';
import 'package:feasta/features/customer/location_picker_screen.dart';
import 'package:feasta/features/authentication/data/services/maps_api_service.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeMaps implements MapsApiService {
  late Completer<CustomerAddressModel> details;
  @override
  Future<CustomerAddressModel> getPlaceDetails(String id) {
    details = Completer<CustomerAddressModel>();
    return details.future;
  }

  @override
  Future<List<PlaceSearchResult>> searchPlaces(String query) async => [
    const PlaceSearchResult(
      placeId: 'venue',
      mainText: 'Venue result',
      secondaryText: 'Isabel',
      fullAddress: 'Venue result, Isabel',
    ),
  ];
  final requests = <Completer<CustomerAddressModel>>[];
  @override
  Future<CustomerAddressModel> reverseGeocode({
    required double latitude,
    required double longitude,
    String? addressLabel,
  }) {
    final result = Completer<CustomerAddressModel>();
    requests.add(result);
    return result.future;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeLocation extends LocationService {
  late Completer<Position> position;
  @override
  Future<Position> getCurrentPosition() {
    position = Completer<Position>();
    return position.future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FakeMaps api;
  late FakeLocation gps;
  late GoogleMap map;
  final initial = CustomerAddressModel.defaultOrmoc.copyWith(
    id: 'confirmed',
    fullAddress: 'Confirmed venue, Isabel',
    city: 'Isabel',
  );
  setUp(() {
    api = FakeMaps();
    gps = FakeLocation();
    SharedPreferences.setMockInitialValues({
      'feasta_preferred_map_type': 'satellite',
    });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('feasta/maps_configuration'),
          (_) async => true,
        );
  });
  Future<void> open(WidgetTester tester, {bool confirmed = true}) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LocationPickerScreen(
          initialAddress: confirmed ? initial : null,
          sessionOnly: true,
          mapsApiService: api,
          locationService: gps,
          mapBuilder: (value) {
            map = value;
            return const ColoredBox(color: Colors.blue);
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'native red draggable marker restores confirmed pin with padded viewport',
    (tester) async {
      await open(tester);
      final marker = map.markers.single;
      expect(marker.position, LatLng(initial.latitude, initial.longitude));
      expect(marker.draggable, isTrue);
      expect(
        marker.icon.toJson(),
        BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed).toJson(),
      );
      expect(map.mapType, MapType.satellite);
      expect(map.padding.bottom, greaterThanOrEqualTo(300));
      expect(map.onCameraMove, isNull);
      expect(map.onCameraIdle, isNull);
      expect(api.requests, isEmpty);
    },
  );
  testWidgets(
    'drag invalidates old address and resolves exact final coordinates',
    (tester) async {
      await open(tester);
      map.markers.single.onDragEnd!(const LatLng(10.9, 124.4));
      await tester.pump();
      expect(map.markers.single.position, const LatLng(10.9, 124.4));
      expect(find.text(initial.fullAddress), findsNothing);
      api.requests.single.complete(initial.copyWith(fullAddress: 'New venue'));
      await tester.pumpAndSettle();
      expect(find.text('New venue'), findsOneWidget);
      expect(map.markers.single.position, const LatLng(10.9, 124.4));
    },
  );
  testWidgets('map taps win over stale geocoding responses', (tester) async {
    await open(tester);
    map.onTap!(const LatLng(10.9, 124.4));
    map.onTap!(const LatLng(10.8, 124.3));
    api.requests.last.complete(initial.copyWith(fullAddress: 'Newest venue'));
    await tester.pumpAndSettle();
    api.requests.first.complete(
      initial.copyWith(fullAddress: 'Obsolete venue'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Newest venue'), findsOneWidget);
    expect(find.text('Obsolete venue'), findsNothing);
    expect(map.markers.single.position, const LatLng(10.8, 124.3));
  });
  testWidgets('geocoding failure retains pin and requires written address', (
    tester,
  ) async {
    await open(tester);
    map.onTap!(const LatLng(10.8, 124.3));
    api.requests.single.completeError(const MapsApiException('offline'));
    await tester.pumpAndSettle();
    expect(map.markers.single.position, const LatLng(10.8, 124.3));
    expect(find.text(initial.fullAddress), findsNothing);
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Confirm Event Location'),
    );
    expect(button.onPressed, isNull);
  });
  testWidgets('unselected default camera cannot be confirmed', (tester) async {
    await open(tester, confirmed: false);
    expect(api.requests, isEmpty);
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Confirm Event Location'),
    );
    expect(button.onPressed, isNull);
  });
  testWidgets('search result moves marker and updates written address', (
    tester,
  ) async {
    await open(tester);
    await tester.enterText(find.byType(TextField), 'venue');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Venue result'));
    await tester.pump();
    api.details.complete(
      initial.copyWith(
        latitude: 10.7,
        longitude: 124.2,
        fullAddress: 'Searched venue, Isabel',
      ),
    );
    await tester.pumpAndSettle();
    expect(map.markers.single.position, const LatLng(10.7, 124.2));
    expect(find.text('Searched venue, Isabel'), findsOneWidget);
  });
  testWidgets('GPS selection uses same pin and reverse geocoding', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byIcon(Icons.my_location_rounded).first);
    gps.position.complete(
      Position(
        latitude: 10.6,
        longitude: 124.1,
        timestamp: DateTime.now(),
        accuracy: 10,
        altitude: 0,
        altitudeAccuracy: 0,
        heading: 0,
        headingAccuracy: 0,
        speed: 0,
        speedAccuracy: 0,
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(map.markers.single.position, const LatLng(10.6, 124.1));
    expect(find.text(initial.fullAddress), findsNothing);
    api.requests.single.complete(initial.copyWith(fullAddress: 'GPS venue'));
    await tester.pumpAndSettle();
    expect(find.text('GPS venue'), findsOneWidget);
  });
  testWidgets('late search response cannot override newer map tap', (
    tester,
  ) async {
    await open(tester);
    await tester.enterText(find.byType(TextField), 'venue');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Venue result'));
    map.onTap!(const LatLng(10.5, 124.0));
    api.requests.single.complete(initial.copyWith(fullAddress: 'Tapped venue'));
    await tester.pumpAndSettle();
    api.details.complete(initial.copyWith(fullAddress: 'Late search venue'));
    await tester.pumpAndSettle();
    expect(find.text('Tapped venue'), findsOneWidget);
    expect(map.markers.single.position, const LatLng(10.5, 124.0));
  });
  testWidgets('confirmation returns final coordinates and resolved address', (
    tester,
  ) async {
    CustomerAddressModel? returned;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                returned = await Navigator.push<CustomerAddressModel>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => LocationPickerScreen(
                      initialAddress: initial,
                      sessionOnly: true,
                      mapsApiService: api,
                      mapBuilder: (value) {
                        map = value;
                        return const SizedBox.expand();
                      },
                    ),
                  ),
                );
              },
              child: const Text('Open picker'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open picker'));
    await tester.pumpAndSettle();
    map.onTap!(const LatLng(10.4, 123.9));
    api.requests.single.complete(
      initial.copyWith(fullAddress: 'Confirmed final venue'),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Confirm Event Location'));
    await tester.tap(find.text('Confirm Event Location'));
    await tester.pumpAndSettle();
    expect(returned?.latitude, 10.4);
    expect(returned?.longitude, 123.9);
    expect(returned?.fullAddress, 'Confirmed final venue');
  });
  test('invalid and missing coordinates are never valid pins', () {
    expect(initial.copyWith(latitude: double.nan).hasCoordinates, isFalse);
    expect(initial.copyWith(latitude: 91).hasCoordinates, isFalse);
    expect(
      CustomerAddressModel.fromMap({'fullAddress': 'Manual'}).hasCoordinates,
      isFalse,
    );
  });
}
