import '../../shared/models/booking_contract.dart';
import 'location_picker_screen.dart';
import 'widgets/preparation_availability.dart';
import 'widgets/package_option_cards.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_shadows.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/event_customization_data.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/widgets/loading_skeleton.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'addon_marketplace_screen.dart';
import 'booking_summary_screen.dart';
import 'widgets/booking_preparation_price.dart';
import 'manual_address_screen.dart';
import '../../shared/models/customer_address_model.dart';
import '../../core/helpers/booking_preparation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../authentication/data/services/customer_address_storage_service.dart';

class EventCustomizationScreen extends StatefulWidget {
  const EventCustomizationScreen({
    required this.provider,
    required this.eventPackage,
    this.repository,
    this.initialServiceTier,
    this.onServiceChanged,
    super.key,
  });

  final ValueChanged<String>? onServiceChanged;
  final String? initialServiceTier;
  final FeastaRepository? repository;
  final ProviderModel provider;
  final PackageModel eventPackage;

  @override
  State<EventCustomizationScreen> createState() =>
      _EventCustomizationScreenState();
}

class _EventCustomizationScreenState extends State<EventCustomizationScreen> {
  late final FeastaRepository repository;
  late PackageModel _eventPackage;
  String? _draftOwner;
  String? selectedServiceTier;
  String? selectedThemeId;
  String? themeChoice;
  final customThemeController = TextEditingController();
  bool _checking = false;
  int _step = 0;
  final _scrollController = ScrollController();

  void _goToStep(int step) {
    FocusScope.of(context).unfocus();
    _saveDraft();
    setState(() => _step = step);
    if (_scrollController.hasClients) _scrollController.jumpTo(0);
  }

  CustomerAddressModel? _eventAddress;
  final locationController = TextEditingController(text: 'Ormoc City');
  final addressController = TextEditingController();
  final guestCountController = TextEditingController();
  final specialRequestController = TextEditingController();
  final customerArrangedAddOnsController = TextEditingController();

  bool useCateringProviderAddOns = true;
  bool useMarketplaceAddOns = false;
  bool willArrangeOwnAddOns = false;

  final List<Map<String, dynamic>> selectedMarketplaceAddOns = [];
  final List<Map<String, dynamic>> selectedAddOns = [];

  String selectedEventType = 'Birthday';
  DateTime? selectedDate;
  TimeOfDay? selectedStartTime;
  TimeOfDay? selectedEndTime;

  late int guestCount;

  late List<String> selectedFoods;
  late List<String> selectedDecorations;
  late List<String> selectedFurniture;

  List<String> get _eventTypes {
    final type = _eventPackage.eventType.trim();
    if (type.isNotEmpty) return [type];
    // The package contract currently publishes one scalar eventType. Provider
    // categories do not establish this package's eligibility.
    return const [];
  }

  @override
  void initState() {
    super.initState();
    _eventPackage = widget.eventPackage;

    repository = widget.repository ?? FeastaRepository();
    _draftOwner = FirebaseAuth.instance.currentUser?.uid;
    guestCount = _eventPackage.guestCapacity > 0
        ? _eventPackage.guestCapacity
        : preparationMinimumGuests(_eventPackage);

    final packageEventType = _eventPackage.eventType.trim();

    selectedEventType = _eventTypes.contains(packageEventType)
        ? packageEventType
        : (_eventTypes.isEmpty ? '' : _eventTypes.first);

    selectedFoods = List<String>.from(_eventPackage.foodInclusions);

    selectedDecorations = List<String>.from(_eventPackage.decorInclusions);

    selectedFurniture = List<String>.from(_eventPackage.furnitureInclusions);
    _restoreDraft();
    if (preparationServices(
      _eventPackage,
    ).containsKey(widget.initialServiceTier)) {
      selectedServiceTier = widget.initialServiceTier;
      if (selectedServiceTier == 'drop_off') {
        selectedThemeId = null;
        themeChoice = null;
        customThemeController.clear();
      }
    }
    _step = 0;
    guestCountController.text = '$guestCount';
    _loadSelectedAddress();
  }

  Future<void> _loadSelectedAddress() async {
    try {
      final address = await CustomerAddressStorageService()
          .getSelectedAddress();
      if (!mounted ||
          address == null ||
          addressController.text.trim().isNotEmpty) {
        return;
      }
      setState(() {
        _eventAddress = address;
        locationController.text = address.city;
        addressController.text = address.fullAddress;
      });
    } catch (_) {
      // Manual address entry remains available if local storage cannot load.
    }
  }

  Map<String, dynamic> get _formSnapshot => {
    'step': _step,
    'date': selectedDate,
    'start': selectedStartTime,
    'end': selectedEndTime,
    'type': selectedEventType,
    'guests': guestCount,
    'city': locationController.text,
    'address': addressController.text,
    'eventAddress': _eventAddress,
    'notes': specialRequestController.text,
    'ownNotes': customerArrangedAddOnsController.text,
    'foods': List<String>.of(selectedFoods),
    'decorations': List<String>.of(selectedDecorations),
    'furniture': List<String>.of(selectedFurniture),
    'addons': selectedAddOns
        .map((item) => Map<String, dynamic>.from(item))
        .toList(),
    'own': willArrangeOwnAddOns,
    'tier': selectedServiceTier,
    'theme': selectedThemeId,
    'themeChoice': themeChoice,
    'customTheme': customThemeController.text,
  };
  void _chooseTheme(String? choice) {
    if (choice != null && choice == themeChoice) return;
    setState(() {
      themeChoice = choice;
      selectedThemeId = null;
      customThemeController.clear();
    });
    _saveDraft();
  }

  void _saveDraft() {
    final owner = _draftOwner;
    if (owner != null && FirebaseAuth.instance.currentUser?.uid == owner) {
      preparationDraftMemory.save(
        owner,
        widget.provider.id,
        _eventPackage.id,
        _formSnapshot,
      );
    }
  }

  void _restoreDraft() {
    final owner = _draftOwner;
    if (owner == null) {
      preparationDraftMemory.clear();
      return;
    }
    final saved = preparationDraftMemory.open(
      owner,
      widget.provider.id,
      _eventPackage.id,
    );
    if (saved == null) return;
    _step = (saved['step'] as int? ?? 0).clamp(0, 2);
    selectedDate = saved['date'] as DateTime?;
    selectedStartTime = saved['start'] as TimeOfDay?;
    selectedEndTime = saved['end'] as TimeOfDay?;
    final type = saved['type'] as String?;
    if (type != null && _eventTypes.contains(type)) selectedEventType = type;
    guestCount = saved['guests'] as int;
    locationController.text = saved['city'] as String;
    addressController.text = saved['address'] as String;
    _eventAddress = saved['eventAddress'] as CustomerAddressModel?;
    specialRequestController.text = saved['notes'] as String;
    customerArrangedAddOnsController.text = saved['ownNotes'] as String;
    selectedFoods = List<String>.from(
      saved['foods'] as List,
    ).where(_eventPackage.foodInclusions.contains).toList();
    selectedDecorations = List<String>.from(
      saved['decorations'] as List,
    ).where(_eventPackage.decorInclusions.contains).toList();
    selectedFurniture = List<String>.from(
      saved['furniture'] as List,
    ).where(_eventPackage.furnitureInclusions.contains).toList();
    selectedAddOns.addAll(
      (saved['addons'] as List).map(
        (item) => Map<String, dynamic>.from(item as Map),
      ),
    );
    willArrangeOwnAddOns = saved['own'] == true;
    selectedServiceTier = saved['tier'] as String?;
    selectedThemeId = saved['theme'] as String?;
    themeChoice = saved['themeChoice'] as String?;
    customThemeController.text = saved['customTheme'] as String? ?? '';
    if (!preparationServices(_eventPackage).containsKey(selectedServiceTier)) {
      selectedServiceTier = null;
    }
    if (_eventPackage.themeOptions
            .where((theme) => theme['id'] == selectedThemeId)
            .length !=
        1) {
      selectedThemeId = null;
    }
    selectedMarketplaceAddOns.addAll(
      selectedAddOns.where(
        (addon) => addon['source'] == 'feasta_addon_provider',
      ),
    );
    useMarketplaceAddOns = selectedMarketplaceAddOns.isNotEmpty;
  }

  void _invalidateMapAddress(String _) {
    setState(() => _eventAddress = null);
    _saveDraft();
  }

  Future<void> _chooseOnMap() async {
    final result = await Navigator.push<CustomerAddressModel>(
      context,
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          initialAddress: _eventAddress,
          sessionOnly: true,
        ),
      ),
    );
    if (!mounted || result == null) return;
    setState(() {
      _eventAddress = result;
      locationController.text = result.city;
      addressController.text = result.fullAddress;
    });
    _saveDraft();
  }

  Future<void> _manualAddress() async {
    final result = await Navigator.push<CustomerAddressModel>(
      context,
      MaterialPageRoute(builder: (_) => const ManualAddressScreen()),
    );
    if (!mounted || result == null) return;
    setState(() {
      _eventAddress = result;
      locationController.text = result.city;
      addressController.text = result.fullAddress;
    });
    _saveDraft();
  }

  @override
  void dispose() {
    _saveDraft();
    _scrollController.dispose();
    customThemeController.dispose();
    locationController.dispose();
    addressController.dispose();
    guestCountController.dispose();
    specialRequestController.dispose();
    customerArrangedAddOnsController.dispose();

    super.dispose();
  }

  String _formatTime(TimeOfDay? time) {
    if (time == null) {
      return '';
    }

    final hour = time.hourOfPeriod == 0 ? 12 : time.hourOfPeriod;
    final minute = time.minute.toString().padLeft(2, '0');
    final period = time.period == DayPeriod.am ? 'AM' : 'PM';

    return '$hour:$minute $period';
  }

  String _formatDate(DateTime? date) {
    if (date == null) {
      return 'Select event date';
    }

    const months = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();

    final initialDate =
        selectedDate != null &&
            !selectedDate!.isBefore(DateTime(now.year, now.month, now.day))
        ? selectedDate!
        : now;

    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 2),
      initialDate: initialDate,
    );

    if (!mounted || picked == null) {
      return;
    }

    setState(() {
      selectedDate = picked;
    });
  }

  Future<void> _pickStartTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: selectedStartTime ?? const TimeOfDay(hour: 14, minute: 0),
    );

    if (!mounted || picked == null) {
      return;
    }

    setState(() {
      selectedStartTime = picked;
    });
  }

  Future<void> _pickEndTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: selectedEndTime ?? const TimeOfDay(hour: 18, minute: 0),
    );

    if (!mounted || picked == null) {
      return;
    }

    setState(() {
      selectedEndTime = picked;
    });
  }

  void _decreaseGuests() {
    if (guestCount <= preparationMinimumGuests(_eventPackage)) {
      return;
    }

    setState(() {
      guestCount--;
      guestCountController.text = '$guestCount';
    });
  }

  void _increaseGuests() {
    if (preparationMaximumGuests(_eventPackage) != null &&
        guestCount >= preparationMaximumGuests(_eventPackage)!) {
      return;
    }

    setState(() {
      guestCount++;
      guestCountController.text = '$guestCount';
    });
  }

  void _toggleStringItem({
    required String item,
    required List<String> selectedList,
    required bool value,
  }) {
    if (!_eventPackage.isCustomizable) return;
    setState(() {
      if (value) {
        if (!selectedList.contains(item)) {
          selectedList.add(item);
        }
      } else {
        selectedList.remove(item);
      }
    });
  }

  Future<void> _openMarketplace() async {
    final result = await Navigator.push<List<Map<String, dynamic>>>(
      context,
      MaterialPageRoute(
        builder: (_) => AddonMarketplaceScreen(
          repository: repository,
          selectedExternalAddOns: selectedMarketplaceAddOns,
        ),
      ),
    );

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      selectedMarketplaceAddOns
        ..clear()
        ..addAll(result);

      selectedAddOns.removeWhere(
        (addon) => addon['source'] == 'feasta_addon_provider',
      );

      selectedAddOns.addAll(selectedMarketplaceAddOns);
    });
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  String? _stepValidation() => selectedEventType.isEmpty
      ? 'Published event category unavailable. Please ask the provider to update the package.'
      : validatePreparation(
          package: _eventPackage,
          providerId: widget.provider.id,
          eventType: selectedEventType,
          date: selectedDate,
          startMinutes: selectedStartTime == null
              ? null
              : selectedStartTime!.hour * 60 + selectedStartTime!.minute,
          endMinutes: selectedEndTime == null
              ? null
              : selectedEndTime!.hour * 60 + selectedEndTime!.minute,
          guests: guestCount,
          city: locationController.text,
          address: addressController.text,
          foods: selectedFoods,
          decorations: selectedDecorations,
          furniture: selectedFurniture,
          serviceTier: selectedServiceTier,
          themeId: selectedThemeId,
          validatePackageOptions: _step > 0,
        );

  Future<void> _continueToAvailability() async {
    if (_checking) return;
    if (_draftOwner == null ||
        FirebaseAuth.instance.currentUser?.uid != _draftOwner) {
      _showMessage('Please sign in again to continue preparing your event.');
      return;
    }
    if (selectedDate == null) {
      _showMessage('Please select an event date.');
      return;
    }

    if (selectedStartTime == null) {
      _showMessage('Please select an event start time.');
      return;
    }

    if (selectedEndTime == null) {
      _showMessage('Please select an event end time.');
      return;
    }

    final startMinutes =
        selectedStartTime!.hour * 60 + selectedStartTime!.minute;
    final endMinutes = selectedEndTime!.hour * 60 + selectedEndTime!.minute;

    if (endMinutes <= startMinutes) {
      _showMessage('Event end time must be later than the start time.');
      return;
    }

    if (locationController.text.trim().isEmpty) {
      _showMessage('Please enter the event location.');
      return;
    }

    if (addressController.text.trim().isEmpty) {
      _showMessage('Please enter the event address.');
      return;
    }

    setState(() => _checking = true);
    try {
      final fresh = await repository.getEligiblePackageForPreparation(
        widget.provider.id,
        _eventPackage.id,
      );
      if (!mounted) return;
      if (fresh == null) {
        _showMessage(
          'This package is no longer available. Please choose another package.',
        );
        return;
      }
      final changedOptions =
          (fresh.eventType.trim().isNotEmpty &&
              selectedEventType != fresh.eventType.trim()) ||
          (!fresh.isCustomizable &&
              (selectedFoods.length != fresh.foodInclusions.length ||
                  selectedDecorations.length != fresh.decorInclusions.length ||
                  selectedFurniture.length !=
                      fresh.furnitureInclusions.length)) ||
          !selectedFoods.every(fresh.foodInclusions.contains) ||
          !selectedDecorations.every(fresh.decorInclusions.contains) ||
          !selectedFurniture.every(fresh.furnitureInclusions.contains) ||
          (selectedServiceTier != null &&
              !preparationServices(fresh).containsKey(selectedServiceTier)) ||
          (selectedThemeId != null &&
              !preparationThemes(
                fresh,
              ).any((theme) => theme['id'] == selectedThemeId));
      setState(() {
        _eventPackage = fresh;
        if (!_eventTypes.contains(selectedEventType)) {
          selectedEventType = _eventTypes.isEmpty ? '' : _eventTypes.first;
        }
        if (!fresh.isCustomizable) {
          selectedFoods = List.of(fresh.foodInclusions);
          selectedDecorations = List.of(fresh.decorInclusions);
          selectedFurniture = List.of(fresh.furnitureInclusions);
        }
        selectedFoods.removeWhere(
          (item) => !fresh.foodInclusions.contains(item),
        );
        selectedDecorations.removeWhere(
          (item) => !fresh.decorInclusions.contains(item),
        );
        selectedFurniture.removeWhere(
          (item) => !fresh.furnitureInclusions.contains(item),
        );
        if (!preparationServices(fresh).containsKey(selectedServiceTier)) {
          selectedServiceTier = null;
          themeChoice = null;
          customThemeController.clear();
        }
        if (!preparationThemes(
          fresh,
        ).any((theme) => theme['id'] == selectedThemeId)) {
          selectedThemeId = null;
        }
      });
      if (changedOptions) {
        _showMessage(
          'Package options changed. Please review the updated selections.',
        );
        return;
      }
      final error = validatePreparation(
        package: fresh,
        eventType: selectedEventType,
        providerId: widget.provider.id,
        date: selectedDate,
        startMinutes: startMinutes,
        endMinutes: endMinutes,
        guests: guestCount,
        city: locationController.text,
        address: addressController.text,
        foods: selectedFoods,
        decorations: selectedDecorations,
        furniture: selectedFurniture,
        serviceTier: selectedServiceTier,
        themeId: selectedThemeId,
      );
      if (error != null) {
        _showMessage(error);
        return;
      }
      final currentAddons = <Map<String, dynamic>>[];
      final seenAddons = <String>{};
      for (final addon in selectedAddOns) {
        if (![
          'catering_provider',
          'feasta_addon_provider',
        ].contains(addon['source'])) {
          _showMessage(
            'Please choose add-ons from the current provider or marketplace.',
          );
          return;
        }
        if (!seenAddons.add(addon['addonId']?.toString() ?? '')) continue;
        final current = await repository.getEligiblePreparationAddon(
          addon['addonId']?.toString() ?? '',
        );
        if (!mounted) return;
        if (current == null ||
            current.providerId != addon['providerId'] ||
            (addon['source'] == 'catering_provider' &&
                current.providerId != widget.provider.id)) {
          _showMessage(
            'A selected add-on is no longer available. Please remove it and choose again.',
          );
          return;
        }
        currentAddons.add(
          current.toBookingMap(
            source: addon['source']?.toString() ?? 'catering_provider',
          ),
        );
      }
      setState(() {
        selectedAddOns
          ..clear()
          ..addAll(currentAddons);
        selectedMarketplaceAddOns
          ..clear()
          ..addAll(
            currentAddons.where(
              (addon) => addon['source'] == 'feasta_addon_provider',
            ),
          );
      });
      final customization = snapshotCustomization(
        EventCustomizationData(
          serviceTier: selectedServiceTier,
          packageThemeId: selectedThemeId,
          eventType: selectedEventType,
          eventDate: selectedDate!,
          eventTime: _formatTime(selectedStartTime),
          eventEndTime: _formatTime(selectedEndTime),
          guestCount: guestCount,
          eventLocation: locationController.text.trim(),
          eventAddress: addressController.text.trim(),
          selectedFoods: selectedFoods,
          selectedDecorations: selectedDecorations,
          selectedFurniture: selectedFurniture,
          selectedAddOns: currentAddons,
          willArrangeOwnAddOns: willArrangeOwnAddOns,
          customerArrangedAddOnsNote: customerArrangedAddOnsController.text
              .trim(),
          specialRequest: [
            specialRequestController.text.trim(),
            if (themeChoice == 'custom')
              'Custom theme request (requires provider confirmation): ${customThemeController.text.trim()}',
            if (themeChoice == 'none') 'No theme needed.',
          ].where((value) => value.isNotEmpty).join('\n'),
        ),
      );
      // Validate the transport shape locally without invoking any callable.
      BookingSelection(
        providerId: widget.provider.id,
        packageId: fresh.id,
        customization: customization,
      ).toJson(clientRequestId: 'preparation_only');
      _saveDraft();
      if (!mounted) return;
      if (FirebaseAuth.instance.currentUser?.uid != _draftOwner) {
        preparationDraftMemory.clear();
        _showMessage('Please sign in again to continue preparing your event.');
        return;
      }
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => BookingSummaryScreen(
            provider: widget.provider,
            eventPackage: fresh,
            customization: customization,
            preparationOnly: true,
          ),
        ),
      );
    } on FormatException catch (error) {
      if (mounted) _showMessage(error.message);
    } catch (_) {
      if (mounted) {
        _showMessage(
          'We could not recheck this package and its add-ons. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Customize Event',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: ListView(
        controller: _scrollController,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screen,
          AppSpacing.sm,
          AppSpacing.screen,
          140,
        ),
        children: [
          Text(
            'Customize your event',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 12),
          _PackageSummaryCard(
            provider: widget.provider,
            eventPackage: _eventPackage,
          ),
          const SizedBox(height: 16),
          CustomizationProgress(step: _step),
          const SizedBox(height: 20),
          if (_step == 0) ...[
            const _SectionHeading(
              title: 'Event details',
              subtitle: 'Required: event schedule, guests and full address.',
            ),

            const SizedBox(height: AppSpacing.md),

            _SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _FieldLabel(
                    icon: Icons.celebration_outlined,
                    text: 'Event type',
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  if (_eventTypes.length <= 1)
                    InputDecorator(
                      decoration: _inputDecoration(hintText: 'Event type'),
                      child: Text(
                        selectedEventType.isEmpty
                            ? 'Published event category unavailable'
                            : selectedEventType,
                      ),
                    )
                  else
                    DropdownButtonFormField<String>(
                      key: ValueKey('event-type:$selectedEventType'),
                      initialValue: selectedEventType,
                      isExpanded: true,
                      decoration: _inputDecoration(
                        hintText: 'Choose event type',
                      ),
                      items: _eventTypes
                          .map(
                            (type) => DropdownMenuItem<String>(
                              value: type,
                              child: Text(type),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value == null) {
                          return;
                        }

                        setState(() {
                          selectedEventType = value;
                        });
                      },
                    ),

                  const SizedBox(height: AppSpacing.lg),

                  const _FieldLabel(
                    icon: Icons.calendar_month_outlined,
                    text: 'Event date',
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _PickerField(
                    text: _formatDate(selectedDate),
                    placeholder: selectedDate == null,
                    icon: Icons.calendar_today_outlined,
                    onTap: _pickDate,
                  ),

                  const SizedBox(height: AppSpacing.lg),

                  LayoutBuilder(
                    builder: (context, constraints) {
                      final shouldStack = constraints.maxWidth < 320;

                      final startField = Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const _FieldLabel(
                            icon: Icons.schedule_rounded,
                            text: 'Start time',
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          _PickerField(
                            text: selectedStartTime == null
                                ? 'Select time'
                                : _formatTime(selectedStartTime),
                            placeholder: selectedStartTime == null,
                            icon: Icons.access_time_rounded,
                            onTap: _pickStartTime,
                          ),
                        ],
                      );

                      final endField = Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const _FieldLabel(
                            icon: Icons.schedule_rounded,
                            text: 'End time',
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          _PickerField(
                            text: selectedEndTime == null
                                ? 'Select time'
                                : _formatTime(selectedEndTime),
                            placeholder: selectedEndTime == null,
                            icon: Icons.access_time_rounded,
                            onTap: _pickEndTime,
                          ),
                        ],
                      );

                      if (shouldStack) {
                        return Column(
                          children: [
                            startField,
                            const SizedBox(height: AppSpacing.lg),
                            endField,
                          ],
                        );
                      }

                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: startField),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(child: endField),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),

            const SizedBox(height: AppSpacing.md),

            PreparationAvailability(
              packageId: _eventPackage.id,
              providerId: widget.provider.id,
              providerName: widget.provider.businessName,
              date: selectedDate,
              start: selectedStartTime,
              end: selectedEndTime,
              guests:
                  guestCount >= preparationMinimumGuests(_eventPackage) &&
                      guestCount <=
                          (preparationMaximumGuests(_eventPackage) ?? 10000) &&
                      guestCount <= 10000
                  ? guestCount
                  : 0,
              addonIds: selectedAddOns
                  .where(
                    (item) => [
                      'feasta_addon_provider',
                      'catering_provider',
                    ].contains(item['source']),
                  )
                  .map((item) => item['addonId'].toString())
                  .toList(),
            ),
            _GuestCountCard(
              controller: guestCountController,
              onCountChanged: (text) =>
                  setState(() => guestCount = int.tryParse(text) ?? 0),
              guestCount: guestCount,
              minimumGuests: preparationMinimumGuests(_eventPackage),
              maximumGuests: preparationMaximumGuests(_eventPackage) ?? 0,
              onDecrease: _decreaseGuests,
              onIncrease: _increaseGuests,
            ),

            const SizedBox(height: AppSpacing.md),

            _SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _FieldLabel(
                    icon: Icons.location_city_outlined,
                    text: 'Event location',
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  TextField(
                    controller: locationController,
                    onChanged: _invalidateMapAddress,
                    textInputAction: TextInputAction.next,
                    decoration: _inputDecoration(hintText: 'Ormoc City'),
                  ),

                  const SizedBox(height: AppSpacing.lg),

                  const _FieldLabel(
                    icon: Icons.location_on_outlined,
                    text: 'Full event address',
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  TextButton.icon(
                    onPressed: _manualAddress,
                    icon: const Icon(Icons.edit_location_alt_outlined),
                    label: const Text('Enter address manually'),
                  ),
                  TextField(
                    controller: addressController,
                    onChanged: _invalidateMapAddress,
                    textInputAction: TextInputAction.done,
                    decoration: _inputDecoration(
                      hintText: 'Enter the complete event address',
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _chooseOnMap,
                      icon: const Icon(Icons.location_on),
                      label: Text(
                        _eventAddress?.hasCoordinates == true
                            ? 'View or Edit Map Location'
                            : 'Choose on Map',
                        textAlign: TextAlign.center,
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        backgroundColor: AppColors.surface,
                        side: const BorderSide(color: AppColors.primary),
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.md,
                          vertical: AppSpacing.md,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(AppRadius.large),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (_step == 1) ...[
            if (preparationServices(_eventPackage).isNotEmpty) ...[
              const SizedBox(height: 12),
              const _SectionHeading(
                title: 'Choose your catering service',
                subtitle: 'Select one available service level to continue.',
              ),
              ServiceOptionCards(
                package: _eventPackage,
                selected: selectedServiceTier,
                onSelected: (tier) {
                  setState(() {
                    selectedServiceTier = tier;
                    widget.onServiceChanged?.call(tier);
                    if (tier == 'drop_off') {
                      selectedThemeId = null;
                      themeChoice = null;
                      customThemeController.clear();
                    }
                  });
                  _saveDraft();
                },
              ),
            ],
            if ([
              'buffet_setup',
              'full_service',
            ].contains(selectedServiceTier)) ...[
              Text(
                'Theme Options',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              PackageThemeCards(
                package: _eventPackage,
                selected: selectedThemeId,
                onSelected: (theme) {
                  setState(() {
                    selectedThemeId = selectedThemeId == theme ? null : theme;
                    themeChoice = null;
                    customThemeController.clear();
                  });
                  _saveDraft();
                },
              ),
              ThemeChoiceCard(
                selected: themeChoice == 'none',
                title: 'No theme needed',
                onTap: () => _chooseTheme('none'),
              ),
              ThemeChoiceCard(
                selected: themeChoice == 'custom',
                title: 'Request a custom theme',
                subtitle:
                    'Provider confirmation required. Price is not yet confirmed.',
                onTap: () => _chooseTheme('custom'),
              ),
              if (themeChoice == 'custom') ...[
                const Text('Describe your requested theme'),
                const SizedBox(height: 8),
                TextField(
                  controller: customThemeController,
                  maxLines: 3,
                  decoration: _inputDecoration(
                    hintText: 'E.g., Rustic outdoor, fairytale, modern glam...',
                  ),
                  onChanged: (_) => _saveDraft(),
                ),
                TextButton(
                  onPressed: () => _chooseTheme(null),
                  child: const Text('Cancel request'),
                ),
              ],
            ],
            if (!_eventPackage.isCustomizable)
              const Text('This package has fixed inclusions.'),
            if (_eventPackage.foodInclusions.isNotEmpty ||
                _eventPackage.decorInclusions.isNotEmpty ||
                _eventPackage.furnitureInclusions.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xl),
              const _SectionHeading(
                title: 'Package selections',
                subtitle: 'Adjust the included options for your event.',
              ),
              const SizedBox(height: AppSpacing.md),
            ],

            IgnorePointer(
              ignoring: !_eventPackage.isCustomizable,
              child: _ChecklistSection(
                icon: Icons.restaurant_outlined,
                title: 'Food choices',
                items: _eventPackage.foodInclusions,
                selectedItems: selectedFoods,
                onChanged: (item, value) {
                  _toggleStringItem(
                    item: item,
                    selectedList: selectedFoods,
                    value: value,
                  );
                },
              ),
            ),

            if (_eventPackage.foodInclusions.isNotEmpty &&
                _eventPackage.decorInclusions.isNotEmpty)
              const SizedBox(height: AppSpacing.md),

            IgnorePointer(
              ignoring: !_eventPackage.isCustomizable,
              child: _ChecklistSection(
                icon: Icons.auto_awesome_outlined,
                title: 'Decoration options',
                items: _eventPackage.decorInclusions,
                selectedItems: selectedDecorations,
                onChanged: (item, value) {
                  _toggleStringItem(
                    item: item,
                    selectedList: selectedDecorations,
                    value: value,
                  );
                },
              ),
            ),

            if (_eventPackage.decorInclusions.isNotEmpty &&
                _eventPackage.furnitureInclusions.isNotEmpty)
              const SizedBox(height: AppSpacing.md),

            IgnorePointer(
              ignoring: !_eventPackage.isCustomizable,
              child: _ChecklistSection(
                icon: Icons.chair_outlined,
                title: 'Tables & chairs',
                items: _eventPackage.furnitureInclusions,
                selectedItems: selectedFurniture,
                onChanged: (item, value) {
                  _toggleStringItem(
                    item: item,
                    selectedList: selectedFurniture,
                    value: value,
                  );
                },
              ),
            ),

            const SizedBox(height: AppSpacing.xl),
          ],
          if (_step == 2) ...[
            const _SectionHeading(
              title: 'Add-ons',
              subtitle: 'Optional services and requests.',
            ),

            const SizedBox(height: AppSpacing.md),

            _AddOnOptionCard(
              icon: Icons.storefront_outlined,
              title: 'Provider add-ons',
              description:
                  'Choose optional services offered directly by this provider.',
              value: useCateringProviderAddOns,
              onChanged: (value) {
                setState(() {
                  useCateringProviderAddOns = value;

                  if (!value) {
                    selectedAddOns.removeWhere(
                      (addon) => addon['source'] == 'catering_provider',
                    );
                  }
                });
              },
              child: useCateringProviderAddOns
                  ? _CateringAddOns(
                      providerId: widget.provider.id,
                      repository: repository,
                      selectedAddOns: selectedAddOns,
                      onChanged: (addon, selected) {
                        setState(() {
                          if (selected) {
                            final alreadySelected = selectedAddOns.any(
                              (item) => item['addonId'] == addon.id,
                            );

                            if (!alreadySelected) {
                              selectedAddOns.add(
                                addon.toBookingMap(source: 'catering_provider'),
                              );
                            }
                          } else {
                            selectedAddOns.removeWhere(
                              (item) => item['addonId'] == addon.id,
                            );
                          }
                        });
                      },
                    )
                  : null,
            ),

            const SizedBox(height: AppSpacing.md),

            _AddOnOptionCard(
              icon: Icons.grid_view_rounded,
              title: 'FEASTA add-on marketplace',
              description:
                  'Find photographers, hosts, photo booths, lights and sounds, and more.',
              value: useMarketplaceAddOns,
              onChanged: (value) async {
                if (!value) {
                  setState(() {
                    useMarketplaceAddOns = false;
                    selectedMarketplaceAddOns.clear();

                    selectedAddOns.removeWhere(
                      (addon) => addon['source'] == 'feasta_addon_provider',
                    );
                  });

                  return;
                }

                setState(() {
                  useMarketplaceAddOns = true;
                });

                await _openMarketplace();
              },
              child: useMarketplaceAddOns
                  ? _MarketplaceSelection(
                      addOns: selectedMarketplaceAddOns,
                      onOpenMarketplace: _openMarketplace,
                    )
                  : null,
            ),

            const SizedBox(height: AppSpacing.md),

            _AddOnOptionCard(
              icon: Icons.person_outline_rounded,
              title: 'I will arrange my own add-ons',
              description:
                  'Use this if you already have your own photographer, host, decorations, or other services.',
              value: willArrangeOwnAddOns,
              onChanged: (value) {
                setState(() {
                  willArrangeOwnAddOns = value;

                  if (!value) {
                    customerArrangedAddOnsController.clear();
                  }
                });
              },
              child: willArrangeOwnAddOns
                  ? TextField(
                      controller: customerArrangedAddOnsController,
                      maxLines: 4,
                      decoration: _inputDecoration(
                        hintText:
                            'Example: I will provide my own photographer and sound system.',
                      ),
                    )
                  : null,
            ),

            const SizedBox(height: AppSpacing.xl),

            const _SectionHeading(
              title: 'Special request',
              subtitle:
                  'Share anything else the provider should know about your event.',
            ),

            const SizedBox(height: AppSpacing.md),

            _SectionCard(
              child: TextField(
                controller: specialRequestController,
                minLines: 4,
                maxLines: 6,
                decoration: _inputDecoration(
                  hintText:
                      'Example: Please prepare a small vegetarian option for 5 guests.',
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          BookingPreparationPrice(
            package: _eventPackage,
            addons: selectedAddOns,
            serviceTier: selectedServiceTier,
            hasUnconfirmedRequests:
                willArrangeOwnAddOns ||
                specialRequestController.text.trim().isNotEmpty,
          ),
        ],
      ),
      bottomNavigationBar: MediaQuery.viewInsetsOf(context).bottom > 0
          ? null
          : _CustomizationBottomBar(
              package: _eventPackage,
              addons: selectedAddOns,
              serviceTier: selectedServiceTier,
              onBack: _step > 0 ? () => _goToStep(_step - 1) : null,
              continueLabel: _step < 2 ? 'Continue' : 'Review Event',
              onContinue: _checking
                  ? null
                  : () {
                      if (_step < 2) {
                        final error = _stepValidation();
                        if (error != null) {
                          _showMessage(error);
                          return;
                        }
                        _goToStep(_step + 1);
                      } else {
                        _continueToAvailability();
                      }
                    },
            ),
    );
  }
}

InputDecoration _inputDecoration({required String hintText}) {
  return InputDecoration(
    hintText: hintText,
    hintStyle: AppTypography.body.copyWith(
      color: AppColors.secondaryTextAccessible,
    ),
    filled: true,
    fillColor: AppColors.surface,
    contentPadding: const EdgeInsets.symmetric(
      horizontal: AppSpacing.md,
      vertical: AppSpacing.md,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),
      borderSide: const BorderSide(color: AppColors.border),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),
      borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),
      borderSide: const BorderSide(color: AppColors.error),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),
      borderSide: const BorderSide(color: AppColors.error, width: 1.5),
    ),
  );
}

class _PackageSummaryCard extends StatelessWidget {
  const _PackageSummaryCard({
    required this.provider,
    required this.eventPackage,
  });

  final ProviderModel provider;
  final PackageModel eventPackage;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.large),
            child: SizedBox(
              width: 56,
              height: 56,
              child: FeastaImage.network(
                imageUrl: eventPackage.imageUrl,
                description: '${eventPackage.name} package image',
                fallbackLabel: 'Package image unavailable',
                compactFallback: true,
                width: 56,
                height: 56,
                borderRadius: 0,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Selected Package', style: AppTypography.caption),
                Text(
                  eventPackage.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  'Published package price: ${knownPreparationPrice(eventPackage.price) ? FeastaPriceFormatter.format(eventPackage.price) : 'Unavailable'}',
                  style: AppTypography.bodySmall,
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  provider.businessName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          subtitle,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: child,
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          icon,
          size: AppSizes.iconSmall,
          color: AppColors.secondaryTextAccessible,
        ),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text(
            text,
            style: AppTypography.label.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _PickerField extends StatelessWidget {
  const _PickerField({
    required this.text,
    required this.placeholder,
    required this.icon,
    required this.onTap,
  });

  final String text;
  final bool placeholder;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.large),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.large),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.large),
            border: Border.all(color: AppColors.border),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.inputHeight),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Icon(
                    icon,
                    size: AppSizes.iconMedium,
                    color: AppColors.primaryStrong,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.body.copyWith(
                        color: placeholder
                            ? AppColors.secondaryTextAccessible
                            : AppColors.mainText,
                        fontWeight: placeholder
                            ? FontWeight.w500
                            : FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: AppColors.secondaryTextAccessible,
                    size: AppSizes.iconMedium,
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

class _GuestCountCard extends StatelessWidget {
  const _GuestCountCard({
    required this.guestCount,
    required this.controller,
    required this.onCountChanged,
    required this.minimumGuests,
    required this.maximumGuests,
    required this.onDecrease,
    required this.onIncrease,
  });

  final TextEditingController controller;
  final ValueChanged<String> onCountChanged;
  final int guestCount;
  final int minimumGuests;
  final int maximumGuests;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;

  @override
  Widget build(BuildContext context) {
    final canDecrease = guestCount > minimumGuests;
    final canIncrease = maximumGuests <= 0 || guestCount < maximumGuests;

    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _FieldLabel(icon: Icons.groups_outlined, text: 'Guest count'),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              _CounterButton(
                icon: Icons.remove_rounded,
                enabled: canDecrease,
                semanticLabel: 'Decrease guest count',
                onPressed: onDecrease,
              ),
              Expanded(
                child: Column(
                  children: [
                    SizedBox(
                      width: 110,
                      child: TextField(
                        controller: controller,
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        onChanged: onCountChanged,
                        decoration: const InputDecoration(labelText: 'Guests'),
                      ),
                    ),
                    Text(
                      'guests',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ],
                ),
              ),
              _CounterButton(
                icon: Icons.add_rounded,
                enabled: canIncrease,
                semanticLabel: 'Increase guest count',
                onPressed: onIncrease,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              decoration: BoxDecoration(
                color: AppColors.surfaceMuted,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text(
                '$minimumGuests\u2013$maximumGuests guests allowed',
                style: AppTypography.caption.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CounterButton extends StatelessWidget {
  const _CounterButton({
    required this.icon,
    required this.enabled,
    required this.semanticLabel,
    required this.onPressed,
  });

  final IconData icon;
  final bool enabled;
  final String semanticLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      enabled: enabled,
      child: Material(
        color: enabled ? AppColors.primarySubtle : AppColors.surfaceMuted,
        shape: const CircleBorder(),
        child: IconButton(
          onPressed: enabled ? onPressed : null,
          icon: Icon(icon),
          color: AppColors.primaryStrong,
          disabledColor: AppColors.secondaryTextAccessible,
        ),
      ),
    );
  }
}

class _ChecklistSection extends StatelessWidget {
  const _ChecklistSection({
    required this.icon,
    required this.title,
    required this.items,
    required this.selectedItems,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final List<String> items;
  final List<String> selectedItems;
  final void Function(String item, bool value) onChanged;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SizedBox.shrink();
    }

    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.primarySubtle,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: Icon(
                  icon,
                  color: AppColors.primaryStrong,
                  size: AppSizes.iconMedium,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  title,
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          for (var index = 0; index < items.length; index++) ...[
            _SelectionRow(
              label: items[index],
              selected: selectedItems.contains(items[index]),
              onChanged: (value) {
                onChanged(items[index], value);
              },
            ),
            if (index != items.length - 1)
              const Divider(height: AppSpacing.lg, color: AppColors.border),
          ],
        ],
      ),
    );
  }
}

class _SelectionRow extends StatelessWidget {
  const _SelectionRow({
    required this.label,
    required this.selected,
    required this.onChanged,
  });

  final String label;
  final bool selected;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.medium),
      onTap: () => onChanged(!selected),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: AppTypography.body.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Checkbox(
              value: selected,
              activeColor: AppColors.primary,
              onChanged: (value) {
                onChanged(value ?? false);
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _AddOnOptionCard extends StatelessWidget {
  const _AddOnOptionCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.value,
    required this.onChanged,
    this.child,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool value;
  final ValueChanged<bool> onChanged;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: value
                      ? AppColors.primarySubtle
                      : AppColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: Icon(
                  icon,
                  color: value
                      ? AppColors.primaryStrong
                      : AppColors.secondaryTextAccessible,
                  size: AppSizes.iconMedium,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTypography.cardTitle.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      description,
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              Switch(
                value: value,
                activeTrackColor: AppColors.primary,
                activeThumbColor: AppColors.surface,
                onChanged: onChanged,
              ),
            ],
          ),
          if (child != null) ...[
            const SizedBox(height: AppSpacing.md),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: AppSpacing.md),
            Align(alignment: Alignment.centerLeft, child: child!),
          ],
        ],
      ),
    );
  }
}

class _CateringAddOns extends StatelessWidget {
  const _CateringAddOns({
    required this.providerId,
    required this.repository,
    required this.selectedAddOns,
    required this.onChanged,
  });

  final String providerId;
  final FeastaRepository repository;
  final List<Map<String, dynamic>> selectedAddOns;
  final void Function(AddonModel addon, bool selected) onChanged;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<AddonModel>>(
      stream: repository.addonsByProvider(providerId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const FeastaSkeletonPulse(
            child: Column(
              children: [
                FeastaSkeletonBox(height: 76, radius: AppRadius.large),
                SizedBox(height: AppSpacing.sm),
                FeastaSkeletonBox(height: 76, radius: AppRadius.large),
              ],
            ),
          );
        }

        if (snapshot.hasError) {
          return Text(
            'Add-ons could not be loaded right now.',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          );
        }

        final addons = (snapshot.data ?? const <AddonModel>[])
            .where(
              (addon) =>
                  addon.providerId == providerId &&
                  addon.isActive &&
                  addon.isAvailable,
            )
            .toList();

        if (addons.isEmpty) {
          return Text(
            'This provider has no add-ons available.',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          );
        }

        return Column(
          children: [
            for (var index = 0; index < addons.length; index++) ...[
              _CateringAddOnRow(
                addon: addons[index],
                selected: selectedAddOns.any(
                  (item) => item['addonId'] == addons[index].id,
                ),
                onChanged: (value) {
                  onChanged(addons[index], value);
                },
              ),
              if (index != addons.length - 1)
                const Divider(height: AppSpacing.lg, color: AppColors.border),
            ],
          ],
        );
      },
    );
  }
}

class _CateringAddOnRow extends StatelessWidget {
  const _CateringAddOnRow({
    required this.addon,
    required this.selected,
    required this.onChanged,
  });

  final AddonModel addon;
  final bool selected;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.medium),
      onTap: () => onChanged(!selected),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Checkbox(
              value: selected,
              activeColor: AppColors.primary,
              onChanged: (value) {
                onChanged(value ?? false);
              },
            ),
            const SizedBox(width: AppSpacing.xs),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    addon.name,
                    style: AppTypography.label.copyWith(
                      color: AppColors.mainText,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (addon.description.trim().isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      addon.description.trim(),
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        height: 1.35,
                      ),
                    ),
                  ],
                  if (addon.providerBusinessName.trim().isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      addon.providerBusinessName,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '+',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                FeastaPriceText(
                  amount: addon.price,
                  decimalDigits: 0,
                  style: AppTypography.label.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MarketplaceSelection extends StatelessWidget {
  const _MarketplaceSelection({
    required this.addOns,
    required this.onOpenMarketplace,
  });

  final List<Map<String, dynamic>> addOns;
  final VoidCallback onOpenMarketplace;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (addOns.isEmpty)
          Text(
            'No marketplace add-ons selected yet.',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          )
        else ...[
          Text(
            '${addOns.length} add-on${addOns.length == 1 ? '' : 's'} selected',
            style: AppTypography.label.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          for (var index = 0; index < addOns.length; index++) ...[
            _MarketplaceAddOnRow(addon: addOns[index]),
            if (index != addOns.length - 1)
              const Divider(height: AppSpacing.lg, color: AppColors.border),
          ],
        ],
        const SizedBox(height: AppSpacing.md),
        FeastaSecondaryButton(
          label: addOns.isEmpty ? 'Browse Add-ons' : 'Edit Add-ons',
          icon: const Icon(Icons.grid_view_rounded),
          onPressed: onOpenMarketplace,
        ),
      ],
    );
  }
}

class _MarketplaceAddOnRow extends StatelessWidget {
  const _MarketplaceAddOnRow({required this.addon});

  final Map<String, dynamic> addon;

  @override
  Widget build(BuildContext context) {
    final name = addon['name']?.toString() ?? 'Add-on';
    final provider = addon['providerBusinessName']?.toString() ?? '';
    final price = addon['price'];

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.add_circle_outline_rounded,
          color: AppColors.primaryStrong,
          size: AppSizes.iconMedium,
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (provider.trim().isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  provider,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        FeastaPriceText(
          amount: price is num ? price.toDouble() : double.nan,
          decimalDigits: 0,
          style: AppTypography.label.copyWith(
            color: AppColors.primaryStrong,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _CustomizationBottomBar extends StatelessWidget {
  const _CustomizationBottomBar({
    required this.package,
    required this.addons,
    this.serviceTier,
    required this.onContinue,
    required this.continueLabel,
    this.onBack,
  });

  final PackageModel package;
  final List<Map<String, dynamic>> addons;
  final String? serviceTier;
  final String continueLabel;
  final VoidCallback? onBack;
  final VoidCallback? onContinue;

  String _footerEstimate() {
    if (preparationServices(package).isNotEmpty &&
        !preparationServices(package).containsKey(serviceTier)) {
      return 'Choose a service';
    }
    final total = preparationEstimate(
      package,
      addons,
      serviceTier: serviceTier,
    );
    return total == null ? 'Unavailable' : FeastaPriceFormatter.format(total);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.border)),
        boxShadow: AppShadows.navigation,
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.md,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Known estimate',
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    _footerEstimate(),
                    style: AppTypography.bodySmall,
                    textAlign: TextAlign.end,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Estimated total',
                    style: AppTypography.bodySmall,
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    _footerEstimate(),
                    style: AppTypography.bodySmall,
                    textAlign: TextAlign.end,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: onBack,
                    child: const Text('Back'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FeastaPrimaryButton(
                    label: continueLabel,
                    onPressed: onContinue,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
