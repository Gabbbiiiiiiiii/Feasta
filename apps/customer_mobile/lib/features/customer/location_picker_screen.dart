import '../../core/theme/app_colors.dart';
import 'dart:async';
import 'customization_session.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../shared/models/customer_address_model.dart';
import '../authentication/data/services/customer_address_storage_service.dart';
import '../authentication/data/services/location_service.dart';
import '../authentication/data/services/maps_api_service.dart';
import 'manual_address_screen.dart';

const Color _primary = AppColors.primary;
const Color _background = AppColors.background;
const Color _textPrimary = AppColors.mainText;
const Color _textSecondary = AppColors.secondaryTextAccessible;
const Color _border = AppColors.border;

class LocationPickerScreen extends StatefulWidget {
  const LocationPickerScreen({
    super.key,
    this.initialAddress,
    this.sessionOnly = false,
    this.mapsApiService,
    this.locationService,
    this.mapBuilder,
    this.session,
  });

  final CustomerAddressModel? initialAddress;
  final bool sessionOnly;
  final MapsApiService? mapsApiService;
  final LocationService? locationService;
  final Widget Function(GoogleMap)? mapBuilder;
  final CustomizationSession? session;

  @override
  State createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  late final _session = widget.session;
  bool _sessionClosed = false;
  ModalRoute<dynamic>? _route;
  bool get _authorized =>
      _session == null ||
      (!_sessionClosed &&
          _session.authorized &&
          FirebaseAuth.instance.currentUser?.uid == _session.uid);
  bool get _canPublish => mounted && _authorized && (_route?.isActive ?? true);

  void _sessionChanged() {
    if (!_authorized) {
      _sessionClosed = true;
      searchDebounce?.cancel();
      reverseRequestId++;
      // The removed GoogleMap subtree owns native-controller disposal.
      mapController = null;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _route = ModalRoute.of(context);
  }

  @override
  void setState(VoidCallback fn) {
    if (_canPublish) super.setState(fn);
  }

  final storageService = CustomerAddressStorageService();
  late final locationService = widget.locationService ?? LocationService();
  late final mapsApiService = widget.mapsApiService ?? MapsApiService();
  final searchController = TextEditingController();

  GoogleMapController? mapController;
  CustomerAddressModel previewAddress = CustomerAddressModel.defaultOrmoc;
  List<PlaceSearchResult> suggestions = [];
  LatLng cameraTarget = LocationService.defaultCameraPosition.target;
  MapType mapType = MapType.normal;

  Timer? searchDebounce;
  int reverseRequestId = 0;

  bool _mapsConfigured = false;
  bool _hasResolvedPin = false;
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
    _session?.addListener(_sessionChanged);
    _loadInitialState();
  }

  @override
  void dispose() {
    _session?.removeListener(_sessionChanged);
    searchDebounce?.cancel();
    searchController.dispose();
    mapController?.dispose();
    super.dispose();
  }

  Future<void> _loadInitialState() async {
    if (!_canPublish) return;
    bool configured = false;
    try {
      configured =
          await const MethodChannel(
            'feasta/maps_configuration',
          ).invokeMethod<bool>('isConfigured') ??
          false;
    } on PlatformException catch (_) {
      // Keep manual entry available when native maps cannot initialize.
    } on MissingPluginException catch (_) {
      // Unsupported hosts keep the same manual fallback.
    }
    final selectedAddress =
        widget.initialAddress ??
        (widget.sessionOnly
            ? CustomerAddressModel.defaultOrmoc
            : await storageService.getSelectedOrDefault());
    final mapTypeKey = await storageService.getPreferredMapType();

    if (!_canPublish) return;

    setState(() {
      _mapsConfigured = configured;
      previewAddress = selectedAddress;
      _hasResolvedPin =
          selectedAddress.hasCoordinates &&
          selectedAddress.id != CustomerAddressModel.defaultOrmoc.id &&
          selectedAddress.fullAddress.trim().isNotEmpty;
      cameraTarget = locationService.latLngFromAddress(selectedAddress);
      mapType = _mapTypeFromKey(mapTypeKey);
      isLoading = false;
    });
  }

  void _onSearchChanged(String value) {
    if (!_canPublish) return;
    searchDebounce?.cancel();

    final query = value.trim();
    if (query.length < 2) {
      setState(() {
        suggestions = [];
        isSearching = false;
        errorMessage = null;
      });
      return;
    }

    setState(() {
      isSearching = true;
      errorMessage = null;
    });

    searchDebounce = Timer(const Duration(milliseconds: 420), () async {
      if (!_canPublish) return;
      try {
        final results = await mapsApiService.searchPlaces(query);
        if (!_canPublish || searchController.text.trim() != query) return;

        setState(() {
          suggestions = results;
          isSearching = false;
        });
      } on MapsApiException catch (e) {
        if (!_canPublish || searchController.text.trim() != query) return;

        setState(() {
          suggestions = [];
          isSearching = false;
          errorMessage = e.message;
        });
      }
    });
  }

  Future<void> _useCurrentLocation() async {
    if (!_canPublish) return;
    final requestId = ++reverseRequestId;
    setState(() {
      isLocating = true;
      errorMessage = null;
    });

    try {
      final position = await locationService.getCurrentPosition();
      if (!_canPublish || requestId != reverseRequestId) return;
      _selectPoint(LatLng(position.latitude, position.longitude));
      setState(() {
        accuracyWarning = position.accuracy > 35
            ? 'Location may not be exact. Please move the red pin to the event venue.'
            : null;
      });
      await _moveMapToAddress(previewAddress);
    } on LocationServiceException catch (e) {
      if (!_canPublish || requestId != reverseRequestId) return;

      setState(() {
        isLocating = false;
        errorMessage = e.message;
      });
    } on MapsApiException catch (e) {
      if (!_canPublish || requestId != reverseRequestId) return;

      setState(() {
        isLocating = false;
        errorMessage = e.message;
      });
    } catch (_) {
      if (!_canPublish || requestId != reverseRequestId) return;

      setState(() {
        isLocating = false;
        errorMessage =
            'Unable to get your location. You can enter your address manually.';
      });
    }
  }

  Future<void> _selectSuggestion(PlaceSearchResult suggestion) async {
    if (!_canPublish) return;
    final requestId = ++reverseRequestId;
    FocusScope.of(context).unfocus();
    searchController.text = suggestion.fullAddress;

    setState(() {
      suggestions = [];
      isLocating = false;
      _hasResolvedPin = false;
      isResolvingAddress = true;
      errorMessage = null;
    });

    try {
      final address = await mapsApiService.getPlaceDetails(suggestion.placeId);
      if (!_canPublish || requestId != reverseRequestId) return;

      setState(() {
        _hasResolvedPin =
            address.hasCoordinates && address.fullAddress.trim().isNotEmpty;
        previewAddress = address;
        cameraTarget = LatLng(address.latitude, address.longitude);
        isResolvingAddress = false;
      });

      await _moveMapToAddress(address);
    } on MapsApiException catch (e) {
      if (!_canPublish || requestId != reverseRequestId) return;

      setState(() {
        isResolvingAddress = false;
        errorMessage = e.message;
      });
    }
  }

  void _selectPoint(LatLng target) {
    if (!_canPublish) return;
    reverseRequestId++;
    setState(() {
      cameraTarget = target;
      _hasResolvedPin = false;
      isLocating = false;
      isResolvingAddress = true;
      accuracyWarning = null;
      errorMessage = null;
      previewAddress = CustomerAddressModel.defaultOrmoc.copyWith(
        id: newCustomerAddressId(),
        addressLabel: 'Selected pin',
        fullAddress: 'Resolving address for selected coordinates...',
        streetName: '',
        barangay: '',
        city: '',
        province: '',
        country: '',
        latitude: target.latitude,
        longitude: target.longitude,
      );
    });
    _reverseGeocodeCameraTarget();
  }

  Future<void> _reverseGeocodeCameraTarget() async {
    if (!_canPublish) return;
    final requestId = ++reverseRequestId;
    final target = cameraTarget;

    setState(() {
      isResolvingAddress = true;
      errorMessage = null;
    });

    try {
      final resolvedAddress = await mapsApiService.reverseGeocode(
        latitude: target.latitude,
        longitude: target.longitude,
      );
      final address = resolvedAddress.copyWith(
        latitude: target.latitude,
        longitude: target.longitude,
      );

      if (!_canPublish || requestId != reverseRequestId) return;

      setState(() {
        _hasResolvedPin =
            address.hasCoordinates && address.fullAddress.trim().isNotEmpty;
        previewAddress = address;
        isResolvingAddress = false;
      });
    } catch (_) {
      if (!_canPublish || requestId != reverseRequestId) return;

      setState(() {
        isResolvingAddress = false;
        errorMessage =
            'Address unavailable. Enter the written address manually to confirm.';
        previewAddress = previewAddress.copyWith(
          fullAddress: 'Written address required for selected pin',
        );
      });
    }
  }

  Future<void> _toggleMapType() async {
    if (!_canPublish) return;
    final nextType = mapType == MapType.normal
        ? MapType.satellite
        : MapType.normal;

    setState(() {
      mapType = nextType;
    });

    await storageService.savePreferredMapType(_mapTypeKey(nextType));
  }

  Future<void> _moveMapToAddress(CustomerAddressModel address) async {
    if (!_canPublish) return;
    final controller = mapController;
    if (controller == null) return;

    await locationService.animateToAddress(
      controller: controller,
      address: address,
    );
  }

  Future<void> _confirmPreviewAddress() async {
    if (!_canPublish ||
        !_mapsConfigured ||
        !_hasResolvedPin ||
        isResolvingAddress ||
        isSaving ||
        isLocating) {
      return;
    }
    await _saveAndReturnAddress(
      previewAddress.copyWith(
        latitude: cameraTarget.latitude,
        longitude: cameraTarget.longitude,
      ),
    );
  }

  Future<void> _saveAndReturnAddress(CustomerAddressModel address) async {
    if (!_canPublish || !(_route?.isCurrent ?? true)) return;
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
      if (!widget.sessionOnly) {
        await storageService.saveSelectedAddress(normalizedAddress);
      }
      if (!mounted || !_canPublish) return;

      if (_route?.isCurrent ?? true) {
        Navigator.pop(context, normalizedAddress);
      }
    } catch (_) {
      if (!_canPublish) return;

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
    if (!_canPublish) return;
    reverseRequestId++;
    setState(() {
      isResolvingAddress = false;
      isLocating = false;
    });
    final result = await Navigator.push(
      context,
      CustomizationSessionRoute<CustomerAddressModel>(
        session: _session,
        builder: (context) => ManualAddressScreen(
          initialAddress: editCurrent ? address ?? previewAddress : null,
          preserveAddressId: editCurrent,
        ),
      ),
    );

    if (result == null || !_canPublish) return;

    if (editCurrent) {
      if (!widget.sessionOnly) await storageService.updateAddress(result);

      if (!_canPublish) return;
      await _saveAndReturnAddress(result);
      return;
    }

    await _saveAndReturnAddress(result);
  }

  @override
  Widget build(BuildContext context) =>
      CustomizationSessionBoundary(session: _session, builder: _buildContent);

  Widget _buildContent(BuildContext context) {
    final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;

    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: _background,
      body: isLoading
          ? const _LocationLoading()
          : Stack(
              children: [
                Positioned.fill(
                  child: !_mapsConfigured
                      ? const ColoredBox(
                          color: _background,
                          child: Center(
                            child: Padding(
                              padding: EdgeInsets.all(32),
                              child: Text(
                                'Map unavailable. Enter your event address manually below.',
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                        )
                      : _MapPickerArea(
                          address: previewAddress,
                          mapBuilder: widget.mapBuilder,
                          mapType: mapType,
                          onMapCreated: (controller) {
                            if (_canPublish) mapController = controller;
                          },
                          onSelectPoint: _selectPoint,
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
                  child: IgnorePointer(
                    ignoring: keyboardOpen,
                    child: AnimatedSlide(
                      offset: keyboardOpen
                          ? const Offset(0, 1.05)
                          : Offset.zero,
                      duration: const Duration(milliseconds: 220),
                      curve: Curves.easeOutCubic,
                      child: AnimatedOpacity(
                        opacity: keyboardOpen ? 0 : 1,
                        duration: const Duration(milliseconds: 160),
                        child: LocationActionPanel(
                          address: previewAddress,
                          errorMessage:
                              errorMessage ??
                              (!_mapsConfigured
                                  ? 'Map unavailable. Use manual address entry.'
                                  : !_hasResolvedPin
                                  ? 'Move the red pin or search to select your event location.'
                                  : null),
                          accuracyWarning: accuracyWarning,
                          isResolvingAddress: isResolvingAddress,
                          isSaving: isSaving,
                          isLocating: isLocating,
                          onConfirm: _confirmPreviewAddress,
                          onUseCurrentLocation: _useCurrentLocation,
                          onDismiss: () => Navigator.pop(context),
                          onManualEntry: () => _openManualAddress(),
                          onEditAddress: (address) => _openManualAddress(
                            address: address,
                            editCurrent: true,
                          ),
                        ),
                      ),
                    ),
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
              constraints: const BoxConstraints(maxHeight: 240),
              decoration: _cardDecoration(),
              child: ListView.separated(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                itemCount: suggestions.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final suggestion = suggestions[index];
                  return Material(
                    color: Colors.white,
                    child: ListTile(
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
                    ),
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
  final Widget Function(GoogleMap)? mapBuilder;
  final CustomerAddressModel address;
  final MapType mapType;
  final ValueChanged<GoogleMapController> onMapCreated;
  final ValueChanged<LatLng> onSelectPoint;
  final VoidCallback onToggleMapType;
  final VoidCallback onUseCurrentLocation;
  final bool isLocating;

  const _MapPickerArea({
    this.mapBuilder,
    required this.address,
    required this.mapType,
    required this.onMapCreated,
    required this.onSelectPoint,
    required this.onToggleMapType,
    required this.onUseCurrentLocation,
    required this.isLocating,
  });

  Widget _buildMap(GoogleMap map) => mapBuilder?.call(map) ?? map;

  @override
  Widget build(BuildContext context) {
    final target = LocationService().latLngFromAddress(address);

    return Stack(
      children: [
        _buildMap(
          GoogleMap(
            initialCameraPosition: CameraPosition(target: target, zoom: 18),
            mapType: mapType,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            onMapCreated: onMapCreated,
            padding: EdgeInsets.only(
              top: 100,
              bottom: MediaQuery.sizeOf(context).height * 0.55,
            ),
            markers: {
              Marker(
                markerId: const MarkerId('event-location'),
                position: target,
                icon: BitmapDescriptor.defaultMarkerWithHue(
                  BitmapDescriptor.hueRed,
                ),
                draggable: true,
                onDragEnd: onSelectPoint,
              ),
            },
            onTap: onSelectPoint,
          ),
        ),
        Positioned(
          right: 18,
          top: 120,
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

class LocationActionPanel extends StatefulWidget {
  final CustomerAddressModel address;
  final String? errorMessage;
  final String? accuracyWarning;
  final bool isResolvingAddress;
  final bool isSaving;
  final bool isLocating;
  final VoidCallback onConfirm;
  final VoidCallback onUseCurrentLocation;
  final VoidCallback onDismiss;
  final VoidCallback onManualEntry;
  final ValueChanged<CustomerAddressModel> onEditAddress;

  const LocationActionPanel({
    super.key,
    required this.address,
    required this.errorMessage,
    required this.accuracyWarning,
    required this.isResolvingAddress,
    required this.isSaving,
    required this.isLocating,
    required this.onConfirm,
    required this.onUseCurrentLocation,
    required this.onDismiss,
    required this.onManualEntry,
    required this.onEditAddress,
  });

  @override
  State<LocationActionPanel> createState() => _LocationActionPanelState();
}

class _LocationActionPanelState extends State<LocationActionPanel> {
  double dragDistance = 0;

  void _resetDrag() {
    dragDistance = 0;
  }

  void _handleDragUpdate(DragUpdateDetails details) {
    final delta = details.primaryDelta ?? 0;
    if (delta > 0) {
      dragDistance += delta;
    }
  }

  void _handleDragEnd(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    final shouldDismiss = dragDistance > 72 || velocity > 650;
    _resetDrag();

    if (shouldDismiss) {
      widget.onDismiss();
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onVerticalDragStart: (_) => _resetDrag(),
      onVerticalDragUpdate: _handleDragUpdate,
      onVerticalDragEnd: _handleDragEnd,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.55,
        ),
        child: Container(
          decoration: const BoxDecoration(
            color: _background,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 14),
              child: Column(
                mainAxisSize: MainAxisSize.min,
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
                  if (widget.isResolvingAddress) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: const LinearProgressIndicator(
                        minHeight: 3,
                        color: _primary,
                        backgroundColor: AppColors.primarySubtleStrong,
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (widget.errorMessage != null) ...[
                    _ErrorNotice(
                      message: widget.errorMessage!,
                      onManualEntry: widget.onManualEntry,
                    ),
                    const SizedBox(height: 10),
                  ],
                  _SelectedAddressCard(
                    address: widget.address,
                    onEdit: () => widget.onEditAddress(widget.address),
                  ),
                  TextButton.icon(
                    onPressed: widget.onManualEntry,
                    icon: const Icon(Icons.edit_location_alt_outlined),
                    label: const Text('Enter address manually'),
                  ),
                  const SizedBox(height: 10),
                  _EventLocationInfo(message: widget.accuracyWarning),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: widget.isLocating
                          ? null
                          : widget.onUseCurrentLocation,
                      icon: widget.isLocating
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.my_location_rounded),
                      label: Text(
                        widget.isLocating
                            ? 'Locating...'
                            : 'Use Current Location',
                      ),
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
                    width: double.infinity,
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed:
                              widget.isSaving ||
                                  widget.isLocating ||
                                  widget.isResolvingAddress ||
                                  widget.errorMessage != null
                              ? null
                              : widget.onConfirm,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _primary,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          child: widget.isSaving
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
                    ),
                  ),
                ],
              ),
            ),
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
              color: AppColors.primarySubtle,
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
                  address.fullAddress.trim().isNotEmpty
                      ? address.fullAddress
                      : address.displaySubtitle,
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
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.primarySubtleStrong),
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
        color: AppColors.warningSubtle,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.warningBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.info_outline_rounded,
            color: AppColors.warningBorder,
          ),
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
