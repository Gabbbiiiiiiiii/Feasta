import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../models/customer_address_model.dart';
import '../../services/customer_address_storage_service.dart';
import '../../services/location_service.dart';
import '../../services/maps_api_service.dart';
import 'manual_address_screen.dart';

const Color _primary = Color(0xFFFF6333);
const Color _background = Color(0xFFF8F6F3);
const Color _textPrimary = Color(0xFF2B211D);
const Color _textSecondary = Color(0xFF8C817A);
const Color _border = Color(0xFFE8E1DB);

class LocationPickerScreen extends StatefulWidget {
  const LocationPickerScreen({super.key});

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  final storageService = CustomerAddressStorageService();
  final locationService = LocationService();
  final mapsApiService = MapsApiService();
  final searchController = TextEditingController();

  GoogleMapController? mapController;
  CustomerAddressModel previewAddress = CustomerAddressModel.defaultOrmoc;
  List<PlaceSearchResult> suggestions = [];
  LatLng cameraTarget = LocationService.defaultCameraPosition.target;
  MapType mapType = MapType.normal;

  Timer? searchDebounce;
  Timer? reverseDebounce;
  int reverseRequestId = 0;

  bool isLoading = true;
  bool isSearching = false;
  bool isLocating = false;
  bool isResolvingAddress = false;
  bool isSaving = false;
  String? errorMessage;
  String? accuracyWarning;

  @override
  void initState() {
    super.initState();
    _loadInitialState();
  }

  @override
  void dispose() {
    searchDebounce?.cancel();
    reverseDebounce?.cancel();
    searchController.dispose();
    mapController?.dispose();
    super.dispose();
  }

  Future<void> _loadInitialState() async {
    final selectedAddress = await storageService.getSelectedOrDefault();
    final mapTypeKey = await storageService.getPreferredMapType();

    if (!mounted) return;

    setState(() {
      previewAddress = selectedAddress;
      cameraTarget = locationService.latLngFromAddress(selectedAddress);
      mapType = _mapTypeFromKey(mapTypeKey);
      isLoading = false;
    });
  }

  void _onSearchChanged(String value) {
    searchDebounce?.cancel();

    final query = value.trim();
    if (query.length < 2) {
      setState(() {
        suggestions = [];
        isSearching = false;
      });
      return;
    }

    setState(() {
      isSearching = true;
      errorMessage = null;
    });

    searchDebounce = Timer(const Duration(milliseconds: 420), () async {
      try {
        final results = await mapsApiService.searchPlaces(query);
        if (!mounted || searchController.text.trim() != query) return;

        setState(() {
          suggestions = results;
          isSearching = false;
        });
      } on MapsApiException catch (e) {
        if (!mounted) return;

        setState(() {
          suggestions = [];
          isSearching = false;
          errorMessage = e.message;
        });
      }
    });
  }

  Future<void> _useCurrentLocation() async {
    setState(() {
      isLocating = true;
      errorMessage = null;
    });

    try {
      final position = await locationService.getCurrentPosition();
      final resolvedAddress = await mapsApiService.reverseGeocode(
        latitude: position.latitude,
        longitude: position.longitude,
        addressLabel: 'Pinned location',
      );
      final address = resolvedAddress.copyWith(
        latitude: position.latitude,
        longitude: position.longitude,
      );

      if (!mounted) return;

      setState(() {
        previewAddress = address;
        cameraTarget = LatLng(address.latitude, address.longitude);
        isLocating = false;
        errorMessage = null;
        accuracyWarning = position.accuracy > 35
            ? 'Location may not be exact. Please move the pin to the exact event venue.'
            : null;
      });

      await _moveMapToAddress(address);
    } on LocationServiceException catch (e) {
      if (!mounted) return;

      setState(() {
        isLocating = false;
        errorMessage = e.message;
      });
    } on MapsApiException catch (e) {
      if (!mounted) return;

      setState(() {
        isLocating = false;
        errorMessage = e.message;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        isLocating = false;
        errorMessage =
            'Unable to get your location. You can enter your address manually.';
      });
    }
  }

  Future<void> _selectSuggestion(PlaceSearchResult suggestion) async {
    FocusScope.of(context).unfocus();
    searchController.text = suggestion.fullAddress;

    setState(() {
      suggestions = [];
      isResolvingAddress = true;
      errorMessage = null;
    });

    try {
      final address = await mapsApiService.getPlaceDetails(suggestion.placeId);
      if (!mounted) return;

      setState(() {
        previewAddress = address;
        cameraTarget = LatLng(address.latitude, address.longitude);
        isResolvingAddress = false;
      });

      await _moveMapToAddress(address);
    } on MapsApiException catch (e) {
      if (!mounted) return;

      setState(() {
        isResolvingAddress = false;
        errorMessage = e.message;
      });
    }
  }

  void _onCameraMove(CameraPosition position) {
    cameraTarget = position.target;
    if (accuracyWarning != null) {
      setState(() {
        accuracyWarning = null;
      });
    }
  }

  void _onCameraIdle() {
    reverseDebounce?.cancel();
    reverseDebounce = Timer(const Duration(milliseconds: 650), () {
      _reverseGeocodeCameraTarget();
    });
  }

  Future<void> _reverseGeocodeCameraTarget() async {
    final requestId = ++reverseRequestId;

    setState(() {
      isResolvingAddress = true;
      errorMessage = null;
    });

    try {
      final resolvedAddress = await mapsApiService.reverseGeocode(
        latitude: cameraTarget.latitude,
        longitude: cameraTarget.longitude,
      );
      final address = resolvedAddress.copyWith(
        latitude: cameraTarget.latitude,
        longitude: cameraTarget.longitude,
      );

      if (!mounted || requestId != reverseRequestId) return;

      setState(() {
        previewAddress = address;
        isResolvingAddress = false;
      });
    } on MapsApiException catch (e) {
      if (!mounted || requestId != reverseRequestId) return;

      setState(() {
        isResolvingAddress = false;
        errorMessage = e.message;
      });
    }
  }

  Future<void> _toggleMapType() async {
    final nextType = mapType == MapType.normal
        ? MapType.satellite
        : MapType.normal;

    setState(() {
      mapType = nextType;
    });

    await storageService.savePreferredMapType(_mapTypeKey(nextType));
  }

  Future<void> _moveMapToAddress(CustomerAddressModel address) async {
    final controller = mapController;
    if (controller == null) return;

    await locationService.animateToAddress(
      controller: controller,
      address: address,
    );
  }

  Future<void> _confirmPreviewAddress() async {
    await _saveAndReturnAddress(
      previewAddress.copyWith(
        latitude: cameraTarget.latitude,
        longitude: cameraTarget.longitude,
      ),
    );
  }

  Future<void> _saveAndReturnAddress(CustomerAddressModel address) async {
    setState(() {
      isSaving = true;
      errorMessage = null;
    });

    final normalizedAddress = address.copyWith(
      isDefault: true,
      createdAt:
          address.createdAt == CustomerAddressModel.defaultOrmoc.createdAt
          ? DateTime.now()
          : address.createdAt,
    );

    try {
      await storageService.saveSelectedAddress(normalizedAddress);
      if (!mounted) return;

      Navigator.pop(context, normalizedAddress);
    } catch (_) {
      if (!mounted) return;

      setState(() {
        isSaving = false;
        errorMessage = 'Unable to save this address. Please try again.';
      });
    }
  }

  Future<void> _openManualAddress({
    CustomerAddressModel? address,
    bool editCurrent = false,
  }) async {
    final result = await Navigator.push<CustomerAddressModel>(
      context,
      MaterialPageRoute(
        builder: (_) => ManualAddressScreen(
          initialAddress: editCurrent ? address ?? previewAddress : null,
          preserveAddressId: editCurrent,
        ),
      ),
    );

    if (result == null) return;

    if (editCurrent) {
      await storageService.updateAddress(result);

      if (!mounted) return;
      setState(() {
        previewAddress = result;
      });
      return;
    }

    await _saveAndReturnAddress(result);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _background,
      body: isLoading
          ? const _LocationLoading()
          : Stack(
              children: [
                Positioned.fill(
                  child: _MapPickerArea(
                    address: previewAddress,
                    mapType: mapType,
                    onMapCreated: (controller) {
                      mapController = controller;
                    },
                    onCameraMove: _onCameraMove,
                    onCameraIdle: _onCameraIdle,
                    onToggleMapType: _toggleMapType,
                    onUseCurrentLocation: _useCurrentLocation,
                    isLocating: isLocating,
                  ),
                ),
                SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _MapCloseButton(onTap: () => Navigator.pop(context)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _SearchPanel(
                            controller: searchController,
                            suggestions: suggestions,
                            isSearching: isSearching,
                            onChanged: _onSearchChanged,
                            onSuggestionTap: _selectSuggestion,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Align(
                  alignment: Alignment.bottomCenter,
                  child: _LocationActionPanel(
                    address: previewAddress,
                    errorMessage: errorMessage,
                    accuracyWarning: accuracyWarning,
                    isResolvingAddress: isResolvingAddress,
                    isSaving: isSaving,
                    isLocating: isLocating,
                    onConfirm: _confirmPreviewAddress,
                    onUseCurrentLocation: _useCurrentLocation,
                    onManualEntry: () => _openManualAddress(),
                    onEditAddress: (address) =>
                        _openManualAddress(address: address, editCurrent: true),
                  ),
                ),
              ],
            ),
    );
  }
}

class _MapCloseButton extends StatelessWidget {
  final VoidCallback onTap;

  const _MapCloseButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 5,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: const SizedBox(
          height: 50,
          width: 50,
          child: Icon(Icons.close_rounded, color: _textPrimary, size: 30),
        ),
      ),
    );
  }
}

class _SearchPanel extends StatelessWidget {
  final TextEditingController controller;
  final List<PlaceSearchResult> suggestions;
  final bool isSearching;
  final ValueChanged<String> onChanged;
  final ValueChanged<PlaceSearchResult> onSuggestionTap;

  const _SearchPanel({
    required this.controller,
    required this.suggestions,
    required this.isSearching,
    required this.onChanged,
    required this.onSuggestionTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(26),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: controller,
            onChanged: onChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search venue, street, barangay',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: isSearching
                  ? const Padding(
                      padding: EdgeInsets.all(14),
                      child: SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : controller.text.isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        controller.clear();
                        onChanged('');
                      },
                      icon: const Icon(Icons.close_rounded),
                    ),
              filled: true,
              fillColor: _background,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(999),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 14),
            ),
          ),
          if (suggestions.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              constraints: const BoxConstraints(maxHeight: 168),
              decoration: _cardDecoration(),
              child: ListView.separated(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                itemCount: suggestions.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final suggestion = suggestions[index];

                  return ListTile(
                    leading: const Icon(Icons.location_on_outlined),
                    title: Text(
                      suggestion.mainText,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    subtitle: Text(
                      suggestion.secondaryText.isEmpty
                          ? suggestion.fullAddress
                          : suggestion.secondaryText,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    onTap: () => onSuggestionTap(suggestion),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MapPickerArea extends StatelessWidget {
  final CustomerAddressModel address;
  final MapType mapType;
  final ValueChanged<GoogleMapController> onMapCreated;
  final ValueChanged<CameraPosition> onCameraMove;
  final VoidCallback onCameraIdle;
  final VoidCallback onToggleMapType;
  final VoidCallback onUseCurrentLocation;
  final bool isLocating;

  const _MapPickerArea({
    required this.address,
    required this.mapType,
    required this.onMapCreated,
    required this.onCameraMove,
    required this.onCameraIdle,
    required this.onToggleMapType,
    required this.onUseCurrentLocation,
    required this.isLocating,
  });

  @override
  Widget build(BuildContext context) {
    final target = LatLng(address.latitude, address.longitude);

    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(target: target, zoom: 18),
          mapType: mapType,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          mapToolbarEnabled: false,
          onMapCreated: onMapCreated,
          onCameraMove: onCameraMove,
          onCameraIdle: onCameraIdle,
        ),
        const IgnorePointer(
          child: Center(
            child: Padding(
              padding: EdgeInsets.only(bottom: 42),
              child: Icon(Icons.location_pin, color: _primary, size: 52),
            ),
          ),
        ),
        Positioned(
          right: 18,
          bottom: 360,
          child: Column(
            children: [
              _FloatingMapButton(
                tooltip: mapType == MapType.normal ? 'Satellite' : 'Map',
                icon: mapType == MapType.normal
                    ? Icons.satellite_alt_outlined
                    : Icons.map_outlined,
                onTap: onToggleMapType,
              ),
              const SizedBox(height: 10),
              _FloatingMapButton(
                tooltip: 'Use current location',
                icon: isLocating
                    ? Icons.hourglass_top_rounded
                    : Icons.my_location_rounded,
                onTap: isLocating ? null : onUseCurrentLocation,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LocationActionPanel extends StatelessWidget {
  final CustomerAddressModel address;
  final String? errorMessage;
  final String? accuracyWarning;
  final bool isResolvingAddress;
  final bool isSaving;
  final bool isLocating;
  final VoidCallback onConfirm;
  final VoidCallback onUseCurrentLocation;
  final VoidCallback onManualEntry;
  final ValueChanged<CustomerAddressModel> onEditAddress;

  const _LocationActionPanel({
    required this.address,
    required this.errorMessage,
    required this.accuracyWarning,
    required this.isResolvingAddress,
    required this.isSaving,
    required this.isLocating,
    required this.onConfirm,
    required this.onUseCurrentLocation,
    required this.onManualEntry,
    required this.onEditAddress,
  });

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.36,
      child: Container(
        decoration: const BoxDecoration(
          color: _background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: ListView(
            padding: EdgeInsets.fromLTRB(18, 12, 18, 14 + bottomPadding),
            children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: _border,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              if (isResolvingAddress) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: const LinearProgressIndicator(
                    minHeight: 3,
                    color: _primary,
                    backgroundColor: Color(0xFFFFD9CC),
                  ),
                ),
                const SizedBox(height: 10),
              ],

              if (errorMessage != null) ...[
                _ErrorNotice(message: errorMessage!, onManualEntry: onManualEntry),
                const SizedBox(height: 10),
              ],

              _SelectedAddressCard(
                address: address,
                onEdit: () => onEditAddress(address),
              ),

              const SizedBox(height: 10),

              _EventLocationInfo(message: accuracyWarning),

              const SizedBox(height: 10),

              SizedBox(
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: isLocating ? null : onUseCurrentLocation,
                  icon: isLocating
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.my_location_rounded),
                  label: Text(isLocating ? 'Locating...' : 'Use Current Location'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _primary,
                    side: const BorderSide(color: _border),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 10),

              SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: isSaving ? null : onConfirm,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: isSaving
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Confirm Event Location',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SelectedAddressCard extends StatelessWidget {
  final CustomerAddressModel address;
  final VoidCallback onEdit;

  const _SelectedAddressCard({required this.address, required this.onEdit});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 38,
            width: 38,
            decoration: const BoxDecoration(
              color: Color(0xFFFFECE5),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.location_on_rounded, color: _primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Selected Event Location',
                  style: TextStyle(
                    color: _textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  address.displayTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _textPrimary,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  address.displaySubtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _textSecondary,
                    height: 1.25,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Edit location name',
            onPressed: onEdit,
            icon: const Icon(
              Icons.edit_outlined,
              color: _textSecondary,
              size: 22,
            ),
          ),
        ],
      ),
    );
  }
}

class _FloatingMapButton extends StatelessWidget {
  final String tooltip;
  final IconData icon;
  final VoidCallback? onTap;

  const _FloatingMapButton({
    required this.tooltip,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 4,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            height: 46,
            width: 46,
            child: Icon(icon, color: _textPrimary),
          ),
        ),
      ),
    );
  }
}

class _EventLocationInfo extends StatelessWidget {
  final String? message;

  const _EventLocationInfo({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF3ED),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFFFD9CC)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded, color: _primary, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message ??
                  'Your service provider will go to the pinned event location. You can edit the written address on the next page.',
              style: const TextStyle(
                color: _textPrimary,
                height: 1.35,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorNotice extends StatelessWidget {
  final String message;
  final VoidCallback onManualEntry;

  const _ErrorNotice({required this.message, required this.onManualEntry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFF59E0B)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded, color: Color(0xFFF59E0B)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: _textPrimary,
                height: 1.35,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          TextButton(onPressed: onManualEntry, child: const Text('Enter')),
        ],
      ),
    );
  }
}

class _LocationLoading extends StatelessWidget {
  const _LocationLoading();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: const [
        _SkeletonBlock(height: 54),
        SizedBox(height: 14),
        _SkeletonBlock(height: 300),
        SizedBox(height: 14),
        _SkeletonBlock(height: 170),
      ],
    );
  }
}

class _SkeletonBlock extends StatelessWidget {
  final double height;

  const _SkeletonBlock({required this.height});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
      ),
    );
  }
}

BoxDecoration _cardDecoration({Color borderColor = _border}) {
  return BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(18),
    border: Border.all(color: borderColor),
    boxShadow: const [
      BoxShadow(color: Color(0x08000000), blurRadius: 14, offset: Offset(0, 6)),
    ],
  );
}

MapType _mapTypeFromKey(String key) {
  return key == 'satellite' ? MapType.satellite : MapType.normal;
}

String _mapTypeKey(MapType mapType) {
  return mapType == MapType.satellite ? 'satellite' : 'normal';
}
