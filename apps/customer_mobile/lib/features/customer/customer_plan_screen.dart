import '../../core/domain/service_category.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'best_fit_controller.dart';
import 'best_fit_venue_guard.dart';
import 'widgets/event_schedule_card.dart';
import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/services/occasion_catalog_service.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../shared/models/customer_address_model.dart';
import '../../shared/models/customer_profile_preferences.dart';
import '../../shared/models/event_plan_preferences.dart';
import '../authentication/data/services/customer_address_storage_service.dart';
import 'location_picker_screen.dart';
import 'plan_matching_services_screen.dart';

class CustomerPlanScreen extends StatefulWidget {
  const CustomerPlanScreen({
    this.modalPresentation = false,
    this.scrollController,
    super.key,
  });

  final bool modalPresentation;
  final ScrollController? scrollController;

  @override
  State<CustomerPlanScreen> createState() => _CustomerPlanScreenState();
}

class _CustomerPlanScreenState extends State<CustomerPlanScreen> {
  final OccasionCatalogService _occasionService = OccasionCatalogService();

  List<CatalogOccasion> _occasions = const <CatalogOccasion>[];
  bool _loadingOccasions = true;
  String? _occasionError;
  String? _savedEventType;
  bool _occasionSelectionTouched = false;

  String get _selectedEventLabel {
    for (final occasion in _occasions) {
      if (occasion.id == _selectedEventType) {
        return occasion.label;
      }
    }
    return '';
  }

  void _resolveOccasionSelection() {
    if (_occasions.isEmpty) {
      _selectedEventType = '';
      return;
    }

    final candidate = _occasionSelectionTouched
        ? _selectedEventType
        : (_savedEventType ?? _selectedEventType);

    _selectedEventType =
        _occasionService.resolveActiveId(candidate, _occasions) ??
        _occasions.first.id;
  }

  Future<void> _loadOccasions() async {
    if (!mounted) return;

    setState(() {
      _loadingOccasions = true;
      _occasionError = null;
    });

    try {
      final occasions = await _occasionService.listActiveOccasions();

      if (!mounted) return;

      setState(() {
        _occasions = occasions;
        _loadingOccasions = false;
        _resolveOccasionSelection();
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _occasions = const <CatalogOccasion>[];
        _selectedEventType = '';
        _loadingOccasions = false;
        _occasionError = 'Event types are temporarily unavailable.';
      });
    }
  }

  final CustomerAddressStorageService _addressStorage =
      CustomerAddressStorageService();
  final CustomerProfilePreferencesService _profilePreferencesService =
      CustomerProfilePreferencesService();

  final TextEditingController _minBudgetController = TextEditingController();
  final TextEditingController _maxBudgetController = TextEditingController();
  final TextEditingController _guestCountController = TextEditingController();
  final TextEditingController _customThemeController = TextEditingController();

  final EventPlanPreferencesService _planPreferencesService =
      EventPlanPreferencesService();

  String _selectedEventType = '';
  CustomerAddressModel _selectedAddress = CustomerAddressModel.defaultOrmoc;

  DateTime? _eventDate;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;

  bool _loadingAddress = true;
  final Set<String> _selectedThemes = <String>{};

  List<ServiceCategory> _serviceCategories = [];
  Set<String> _selectedServices = {};
  bool _loadingServices = true;
  bool _serviceLoadFailed = false;

  Future<void> _loadServices() async {
    setState(() {
      _loadingServices = true;
      _serviceLoadFailed = false;
    });
    try {
      final services = (await FeastaRepository().getActiveServiceCategories())
          .where((item) => item.isActive)
          .toList();
      if (!mounted) return;
      final codes = services.map((item) => item.code).toSet();
      final previous =
          PlanMatchingServicesScreen.activeResult?.event.categories;
      setState(() {
        _serviceCategories = services;
        _selectedServices = previous == null
            ? codes
            : codes.intersection(previous);
        _loadingServices = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingServices = false;
        _serviceLoadFailed = true;
      });
    }
  }

  @override
  void initState() {
    super.initState();
    final previous = PlanMatchingServicesScreen.activeResult?.event;
    if (previous != null) {
      TimeOfDay time(String value) {
        final parts = value.split(':').map(int.parse).toList();
        return TimeOfDay(hour: parts[0], minute: parts[1]);
      }

      _savedEventType = previous.occasion;
      _selectedEventType = previous.occasion;
      _occasionSelectionTouched = true;
      _eventDate = DateTime.parse(previous.schedule.eventDate);
      _startTime = time(previous.schedule.eventTime);
      _endTime = time(previous.schedule.eventEndTime);
      _selectedAddress = previous.venue;
      _loadingAddress = false;
      _guestCountController.text = previous.schedule.guestCount.toString();
      _minBudgetController.text = (previous.minimumBudgetCentavos / 100)
          .toString();
      _maxBudgetController.text = (previous.maximumBudgetCentavos / 100)
          .toString();
    } else {
      _loadSelectedAddress();
    }
    _loadOccasions();
    _loadServices();
    _loadPlanPreferences();
  }

  @override
  void dispose() {
    _minBudgetController.dispose();
    _maxBudgetController.dispose();
    _guestCountController.dispose();
    _customThemeController.dispose();
    super.dispose();
  }

  Future<void> _loadSelectedAddress() async {
    final explicitlySelected = await _addressStorage.getSelectedAddress();
    final profileDefault = await _profilePreferencesService
        .loadDefaultEventAddress();

    final address =
        explicitlySelected ??
        profileDefault ??
        CustomerAddressModel.defaultOrmoc;

    if (!mounted) {
      return;
    }

    setState(() {
      _selectedAddress = address;
      _loadingAddress = false;
    });
  }

  Future<void> _loadPlanPreferences() async {
    final saved = await _planPreferencesService.load();

    if (!mounted) {
      return;
    }

    setState(() {
      _savedEventType = saved.eventType;
      _resolveOccasionSelection();

      _selectedThemes
        ..clear()
        ..addAll(saved.themes.take(3));

      if (_guestCountController.text.isEmpty &&
          saved.guestCount != null &&
          saved.guestCount! > 0) {
        _guestCountController.text = saved.guestCount.toString();
      }

      _customThemeController.text = saved.customTheme;
    });
  }

  Future<void> _savePlanPreferences() async {
    await _planPreferencesService.save(
      EventPlanPreferences(
        eventType: _selectedEventType,
        guestCount: _guestCount,
        themes: _selectedThemes.toList(growable: false),
        customTheme: _selectedThemes.contains('Custom theme')
            ? _customThemeController.text.trim()
            : '',
      ),
    );
  }

  int? get _guestCount {
    final value = int.tryParse(_guestCountController.text.trim());

    if (value == null || value <= 0) {
      return null;
    }

    return value;
  }

  double? _parseBudget(TextEditingController controller) {
    final value = controller.text.trim();

    if (value.isEmpty) {
      return null;
    }

    return double.tryParse(value.replaceAll(',', ''));
  }

  Future<void> _pickEventDate() async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    final result = await showDatePicker(
      context: context,
      initialDate: _eventDate ?? today,
      firstDate: today,
      lastDate: DateTime(now.year + 3, 12, 31),
      helpText: 'Select event date',
    );

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      _eventDate = DateTime(result.year, result.month, result.day);
    });
  }

  Future<void> _pickStartTime() async {
    final result = await showTimePicker(
      context: context,
      initialTime: _startTime ?? const TimeOfDay(hour: 10, minute: 0),
      helpText: 'Select start time',
    );

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      _startTime = result;

      if (_endTime != null &&
          _minutesFor(_endTime!) <= _minutesFor(_startTime!)) {
        _endTime = null;
      }
    });
  }

  Future<void> _pickEndTime() async {
    final fallbackHour = _startTime == null
        ? 14
        : (_startTime!.hour + 4).clamp(0, 23);

    final result = await showTimePicker(
      context: context,
      initialTime: _endTime ?? TimeOfDay(hour: fallbackHour, minute: 0),
      helpText: 'Select end time',
    );

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      _endTime = result;
    });
  }

  Future<void> _editLocation() async {
    final result = await Navigator.of(context).push<CustomerAddressModel>(
      MaterialPageRoute(builder: (_) => const LocationPickerScreen()),
    );

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      _selectedAddress = result;
    });
  }

  String? _validatePlan() {
    if (_loadingOccasions || _occasionError != null || _occasions.isEmpty) {
      return 'Active event types are not available. Please retry.';
    }

    if (!_occasions.any((item) => item.id == _selectedEventType)) {
      return 'Choose an active event type.';
    }

    if (_guestCount == null) {
      return 'Enter how many guests are attending.';
    }

    if (_loadingAddress || !isConfirmedBestFitVenue(_selectedAddress)) {
      return 'Set the exact event location and confirm the map pin.';
    }

    final eventDate = _eventDate;

    if (eventDate == null) {
      return 'Choose the event date.';
    }

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    if (eventDate.isBefore(today)) {
      return 'The event date cannot be in the past.';
    }

    if (_startTime == null) {
      return 'Choose the event start time.';
    }

    if (_endTime == null) {
      return 'Choose the event end time.';
    }

    if (_minutesFor(_endTime!) <= _minutesFor(_startTime!)) {
      return 'The end time must be later than the start time.';
    }

    final minBudget = _parseBudget(_minBudgetController);
    final maxBudget = _parseBudget(_maxBudgetController);

    if (minBudget == null || minBudget < 0) {
      return 'Enter a valid minimum budget.';
    }

    if (maxBudget == null || maxBudget < 0) {
      return 'Enter a valid maximum budget.';
    }

    if (minBudget < minPlanningBudgetPesos ||
        maxBudget < minPlanningBudgetPesos) {
      return 'Amount entered is lower than the allowed budget.';
    }

    if (!minBudget.isFinite ||
        !maxBudget.isFinite ||
        minBudget > maxPlanningBudgetPesos ||
        maxBudget > maxPlanningBudgetPesos) {
      return 'Enter a budget of ₱1,000,000 or less.';
    }
    if (maxBudget < minBudget) {
      return 'The maximum budget cannot be lower than the minimum budget.';
    }

    return null;
  }

  bool _editingBestFit = false;

  Future<void> _findServices() async {
    FocusScope.of(context).unfocus();

    final error = _loadingServices
        ? 'Wait for services to load.'
        : _selectedServices.isEmpty
        ? 'Select at least one service.'
        : _validatePlan();

    if (error != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error)));
      return;
    }

    final edit = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PlanMatchingServicesScreen(
          occasionLabel: _selectedEventLabel,
          eventType: _selectedEventType,
          address: _selectedAddress,
          eventDate: _eventDate!,
          startTime: _startTime!,
          endTime: _endTime!,
          minBudget: _parseBudget(_minBudgetController)!,
          maxBudget: _parseBudget(_maxBudgetController)!,
          guestCount: _guestCount!,
          categories: _serviceCategories,
          selectedCategories: Set.of(_selectedServices),
        ),
      ),
    );
    if (mounted) {
      setState(() => _editingBestFit = edit == true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomSafeArea = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: widget.modalPresentation
          ? null
          : AppBar(
              backgroundColor: AppColors.background,
              elevation: 0,
              scrolledUnderElevation: 0,
              title: Text(
                'Plan your event',
                style: AppTypography.title.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          controller: widget.scrollController,
          primary: widget.scrollController == null,
          physics: const ClampingScrollPhysics(),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screen,
            widget.modalPresentation ? AppSpacing.sm : AppSpacing.md,
            AppSpacing.screen,
            150 + bottomSafeArea,
          ),
          children: [
            _PlanIntroCard(eventType: _selectedEventLabel),
            if (_loadingOccasions)
              const LinearProgressIndicator()
            else if (_occasionError != null)
              ListTile(
                title: Text(_occasionError!),
                trailing: TextButton(
                  onPressed: _loadOccasions,
                  child: const Text('Retry'),
                ),
              )
            else if (_occasions.isEmpty)
              const ListTile(
                title: Text('No active event types are available.'),
              ),
            const SizedBox(height: AppSpacing.lg),

            Text(
              'What are you celebrating?',
              style: AppTypography.sectionTitle.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),

            LayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.maxWidth >= 520 ? 4 : 3;
                const gap = AppSpacing.xs;
                final itemWidth =
                    (constraints.maxWidth - (gap * (columns - 1))) / columns;

                return Wrap(
                  spacing: gap,
                  runSpacing: gap,
                  children: _occasions.map((occasion) {
                    final eventType = occasion.id;
                    return SizedBox(
                      width: itemWidth,
                      height: 56,
                      child: _EventTypeTile(
                        label: occasion.label,
                        selected: eventType == _selectedEventType,
                        onTap: () async {
                          if (_selectedEventType == eventType) {
                            return;
                          }

                          setState(() {
                            _selectedEventType = eventType;
                            _occasionSelectionTouched = true;
                          });

                          await _savePlanPreferences();
                        },
                      ),
                    );
                  }).toList(),
                );
              },
            ),

            const SizedBox(height: AppSpacing.lg),

            Text('Services needed', style: AppTypography.sectionTitle),
            const SizedBox(height: AppSpacing.sm),
            if (_loadingServices)
              const LinearProgressIndicator(semanticsLabel: 'Loading services')
            else if (_serviceLoadFailed)
              TextButton(
                onPressed: _loadServices,
                child: const Text('Could not load services. Retry'),
              )
            else if (_serviceCategories.isEmpty)
              const Text('No active services are available.')
            else
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  FilterChip(
                    label: const Text('Select All'),
                    selected:
                        _selectedServices.length == _serviceCategories.length,
                    onSelected: (selected) => setState(() {
                      _selectedServices = selected
                          ? _serviceCategories.map((item) => item.code).toSet()
                          : {};
                    }),
                  ),
                  for (final service in _serviceCategories)
                    FilterChip(
                      label: Text(service.name),
                      selected: _selectedServices.contains(service.code),
                      onSelected: (selected) => setState(() {
                        if (selected) {
                          _selectedServices.add(service.code);
                        } else {
                          _selectedServices.remove(service.code);
                        }
                      }),
                    ),
                ],
              ),
            const SizedBox(height: AppSpacing.lg),

            _GuestCountCard(
              controller: _guestCountController,
              onChanged: (_) {
                _savePlanPreferences();
              },
            ),

            Text(
              'Where is your event?',
              style: AppTypography.sectionTitle.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),

            _LocationSelectionCard(
              address: _selectedAddress,
              loading: _loadingAddress,
              confirmed: isConfirmedBestFitVenue(_selectedAddress),
              onTap: _editLocation,
            ),

            const SizedBox(height: AppSpacing.xs),

            InkWell(
              onTap: _editLocation,
              borderRadius: BorderRadius.circular(AppRadius.medium),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.location_searching_outlined,
                      size: 18,
                      color: AppColors.secondaryTextAccessible,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Text(
                      'Different venue? ',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                    Text(
                      'Change location',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.primaryStrong,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: AppSpacing.lg),

            Text(
              'Event schedule',
              style: AppTypography.sectionTitle.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),

            EventScheduleCard(
              eventDate: _eventDate,
              startTime: _startTime,
              endTime: _endTime,
              onDateTap: _pickEventDate,
              onStartTap: _pickStartTime,
              onEndTap: _pickEndTime,
            ),

            const SizedBox(height: AppSpacing.md),

            _BudgetCard(
              minController: _minBudgetController,
              maxController: _maxBudgetController,
              onSubmitted: _findServices,
            ),

            const SizedBox(height: AppSpacing.lg),

            SizedBox(
              height: 54,
              child: ElevatedButton.icon(
                onPressed: _findServices,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppRadius.large),
                  ),
                ),
                icon: const Icon(Icons.search_rounded),
                label: Text(
                  _editingBestFit
                      ? 'Save and update recommendations'
                      : 'Find Best Fit Services',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

int _minutesFor(TimeOfDay value) => (value.hour * 60) + value.minute;

class _EventTypeTile extends StatelessWidget {
  const _EventTypeTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Material(
        color: selected ? AppColors.primarySubtle : AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          child: AnimatedContainer(
            duration: MediaQuery.of(context).disableAnimations
                ? Duration.zero
                : const Duration(milliseconds: 150),
            curve: Curves.easeOutCubic,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.pill),
              border: Border.all(
                color: selected ? AppColors.primary : AppColors.border,
                width: selected ? 1.4 : 1,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (selected) ...[
                  const Icon(
                    Icons.check_rounded,
                    size: 16,
                    color: AppColors.primaryStrong,
                  ),
                  const SizedBox(width: 2),
                ],
                Flexible(
                  child: Text(
                    label,
                    maxLines: 2,
                    softWrap: true,
                    textAlign: TextAlign.center,
                    style: AppTypography.caption.copyWith(
                      color: selected
                          ? AppColors.primaryStrong
                          : AppColors.mainText,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GuestCountCard extends StatelessWidget {
  const _GuestCountCard({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.primarySubtle,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.groups_2_outlined,
              color: AppColors.primary,
              size: 24,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              onChanged: onChanged,
              decoration: const InputDecoration(
                labelText: 'How many guests?',
                hintText: 'e.g. 50',
                border: InputBorder.none,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LocationSelectionCard extends StatelessWidget {
  const _LocationSelectionCard({
    required this.address,
    required this.loading,
    required this.confirmed,
    required this.onTap,
  });

  final CustomerAddressModel address;
  final bool loading;
  final bool confirmed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final title = loading
        ? 'Loading location…'
        : confirmed
        ? address.displayTitle
        : 'Choose event location';
    final subtitle = loading || !confirmed ? '' : address.displaySubtitle;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.large),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.large),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.large),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.primarySubtle,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.location_on_outlined,
                  color: AppColors.primary,
                  size: 25,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Event location',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.cardTitle.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.secondaryTextAccessible,
                          height: 1.3,
                        ),
                      ),
                    ],
                    if (!loading && confirmed) ...[
                      const SizedBox(height: 5),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.verified_rounded,
                            size: 14,
                            color: AppColors.primary,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Pin confirmed',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.primaryStrong,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _BudgetCard extends StatelessWidget {
  const _BudgetCard({
    required this.minController,
    required this.maxController,
    required this.onSubmitted,
  });

  final TextEditingController minController;
  final TextEditingController maxController;
  final VoidCallback onSubmitted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Budget range',
            style: AppTypography.caption.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: _BudgetField(
                  controller: minController,
                  label: 'Minimum budget',
                  textInputAction: TextInputAction.next,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _BudgetField(
                  controller: maxController,
                  label: 'Maximum budget',
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => onSubmitted(),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Enter any range from ₱1,000 to ₱1,000,000. Best Fit uses your maximum.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _BudgetField extends StatelessWidget {
  const _BudgetField({
    required this.controller,
    required this.label,
    required this.textInputAction,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      textInputAction: textInputAction,
      style: const TextStyle(
        color: AppColors.primaryStrong,
        fontWeight: FontWeight.w700,
      ),
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: AppColors.secondaryTextAccessible),
        floatingLabelBehavior: FloatingLabelBehavior.always,
        prefixText: '₱ ',
        filled: true,
        fillColor: AppColors.background,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.large),
          borderSide: BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.large),
          borderSide: BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.large),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
        ),
      ),
    );
  }
}

class _PlanIntroCard extends StatelessWidget {
  const _PlanIntroCard({required this.eventType});

  final String eventType;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.16)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.celebration_rounded,
              color: AppColors.primary,
              size: 25,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Build your perfect $eventType',
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  'Set your event details and FEASTA will match verified providers.',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.4,
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
