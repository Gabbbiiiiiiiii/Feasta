import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../shared/models/customer_address_model.dart';
import '../../shared/models/customer_profile_preferences.dart';
import '../../shared/models/event_plan_preferences.dart';
import '../authentication/data/services/customer_address_storage_service.dart';
import 'customer_search_screen.dart';
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
  static const List<String> _eventTypes = [
    'Birthday',
    'Wedding',
    'Anniversary',
    'Reunion',
    'Corporate',
    'Baptism',
    'Graduation',
    'Other',
  ];

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

  String _selectedEventType = 'Birthday';
  CustomerAddressModel _selectedAddress = CustomerAddressModel.defaultOrmoc;

  DateTime? _eventDate;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;

  bool _loadingAddress = true;
  bool _loadingPlanPreferences = true;
  final Set<String> _selectedThemes = <String>{};

  @override
  void initState() {
    super.initState();
    _loadSelectedAddress();
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
      if (_eventTypes.contains(saved.eventType)) {
        _selectedEventType = saved.eventType;
      }

      _selectedThemes
        ..clear()
        ..addAll(saved.themes.take(3));

      if (saved.guestCount != null && saved.guestCount! > 0) {
        _guestCountController.text = saved.guestCount.toString();
      }

      _customThemeController.text = saved.customTheme;

      _loadingPlanPreferences = false;
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

  Future<void> _toggleTheme(String theme) async {
    if (theme == 'Not sure yet') {
      setState(() {
        _selectedThemes
          ..clear()
          ..add('Not sure yet');
        _customThemeController.clear();
      });

      await _savePlanPreferences();
      return;
    }

    if (_selectedThemes.contains(theme)) {
      setState(() {
        _selectedThemes.remove(theme);

        if (theme == 'Custom theme') {
          _customThemeController.clear();
        }
      });

      await _savePlanPreferences();
      return;
    }

    if (_selectedThemes.length >= 3) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            backgroundColor: AppColors.primary,
            behavior: SnackBarBehavior.floating,
            content: Text(
              'You can choose up to 3 themes.',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        );

      return;
    }
    setState(() {
      _selectedThemes
        ..remove('Not sure yet')
        ..add(theme);
    });

    await _savePlanPreferences();
  }

  double? _parseBudget(TextEditingController controller) {
    final value = controller.text.trim();

    if (value.isEmpty) {
      return null;
    }

    return double.tryParse(value);
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
    if (_selectedEventType.trim().isEmpty) {
      return 'Choose an event type.';
    }

    if (_guestCount == null) {
      return 'Enter how many guests are attending.';
    }

    if (!_selectedAddress.hasCoordinates) {
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

    if (maxBudget < minBudget) {
      return 'The maximum budget cannot be lower than the minimum budget.';
    }

    return null;
  }

  Future<void> _findServices() async {
    FocusScope.of(context).unfocus();

    final error = _validatePlan();

    if (error != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error)));
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PlanMatchingServicesScreen(
          eventType: _selectedEventType,
          address: _selectedAddress,
          eventDate: _eventDate!,
          startTime: _startTime!,
          endTime: _endTime!,
          minBudget: _parseBudget(_minBudgetController)!,
          maxBudget: _parseBudget(_maxBudgetController)!,
          guestCount: _guestCount!,
          themes: _selectedThemes.toList(growable: false),
          customTheme: _customThemeController.text.trim(),
        ),
      ),
    );
  }

  void _openCategory(String query) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CustomerSearchScreen(
          initialQuery: query,
          initialEventType: _selectedEventType,
          initialLocation: _selectedAddress.city,
          initialMinBudget: _parseBudget(_minBudgetController),
          initialMaxBudget: _parseBudget(_maxBudgetController),
        ),
      ),
    );
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
            _PlanIntroCard(eventType: _selectedEventType),
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
                  children: _eventTypes.map((eventType) {
                    return SizedBox(
                      width: itemWidth,
                      height: 42,
                      child: _EventTypeTile(
                        label: eventType,
                        selected: eventType == _selectedEventType,
                        onTap: () async {
                          if (_selectedEventType == eventType) {
                            return;
                          }

                          setState(() {
                            _selectedEventType = eventType;
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

            _GuestCountCard(
              controller: _guestCountController,
              onChanged: (_) {
                _savePlanPreferences();
              },
            ),

            const SizedBox(height: AppSpacing.xl),

            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Text(
                    'Do you have a theme?',
                    style: AppTypography.sectionTitle.copyWith(
                      color: AppColors.mainText,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Text(
                  'Optional · Choose up to 3',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),

            if (_loadingPlanPreferences)
              const LinearProgressIndicator(
                color: AppColors.primary,
                backgroundColor: AppColors.primarySubtle,
              )
            else
              _DynamicThemeSuggestions(
                eventType: _selectedEventType,
                selectedThemes: _selectedThemes,
                onThemeTap: _toggleTheme,
              ),

            if (_selectedThemes.contains('Custom theme')) ...[
              const SizedBox(height: AppSpacing.sm),
              TextField(
                controller: _customThemeController,
                textInputAction: TextInputAction.done,
                onChanged: (_) {
                  _savePlanPreferences();
                },
                decoration: InputDecoration(
                  labelText: 'Your custom theme',
                  hintText: 'e.g. Celestial garden',
                  filled: true,
                  fillColor: AppColors.surface,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.large),
                    borderSide: const BorderSide(color: AppColors.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.large),
                    borderSide: const BorderSide(color: AppColors.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.large),
                    borderSide: const BorderSide(
                      color: AppColors.primary,
                      width: 1.5,
                    ),
                  ),
                ),
              ),
            ],

            if (_selectedThemes.isNotEmpty &&
                !_selectedThemes.contains('Not sure yet')) ...[
              const SizedBox(height: AppSpacing.sm),
              _ThemePreviewCard(
                themes: _selectedThemes.toList(growable: false),
                customTheme: _customThemeController.text.trim(),
              ),
            ],

            const SizedBox(height: AppSpacing.xl),

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

            _ScheduleCard(
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
                label: const Text(
                  'Find matching services',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                ),
              ),
            ),

            const SizedBox(height: AppSpacing.xl),

            Text(
              'Quick services',
              style: AppTypography.sectionTitle.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),

            Row(
              children: [
                Expanded(
                  child: _QuickServiceCard(
                    icon: Icons.restaurant_menu_outlined,
                    label: 'Catering',
                    onTap: () => _openCategory('Catering'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _QuickServiceCard(
                    icon: Icons.camera_alt_outlined,
                    label: 'Photography',
                    onTap: () => _openCategory('Photography'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _QuickServiceCard(
                    icon: Icons.auto_awesome_outlined,
                    label: 'Styling',
                    onTap: () => _openCategory('Event Styling'),
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

int _minutesFor(TimeOfDay value) => (value.hour * 60) + value.minute;

String _formatDate(DateTime? value) {
  if (value == null) {
    return 'Choose date';
  }

  const months = [
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

  return '${months[value.month - 1]} ${value.day}, ${value.year}';
}

String _formatTime(BuildContext context, TimeOfDay? value) {
  if (value == null) {
    return 'Choose time';
  }

  return MaterialLocalizations.of(context).formatTimeOfDay(value);
}

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
                SizedBox(
                  width: 18,
                  child: AnimatedOpacity(
                    opacity: selected ? 1 : 0,
                    duration: const Duration(milliseconds: 120),
                    child: const Icon(
                      Icons.check_rounded,
                      size: 16,
                      color: AppColors.primaryStrong,
                    ),
                  ),
                ),
                const SizedBox(width: 2),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
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

class _ThemeChoiceChip extends StatelessWidget {
  const _ThemeChoiceChip({
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled,
      label: label,
      child: Opacity(
        opacity: enabled ? 1 : 0.45,
        child: Material(
          color: selected ? AppColors.primarySubtle : AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          child: InkWell(
            onTap: enabled ? onTap : null,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: AnimatedContainer(
              duration: reduceMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 150),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppRadius.pill),
                border: Border.all(
                  color: selected ? AppColors.primary : AppColors.border,
                  width: selected ? 1.4 : 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (selected) ...[
                    const Icon(
                      Icons.check_rounded,
                      size: 16,
                      color: AppColors.primaryStrong,
                    ),
                    const SizedBox(width: 4),
                  ],
                  Text(
                    label,
                    style: AppTypography.caption.copyWith(
                      color: selected
                          ? AppColors.primaryStrong
                          : AppColors.mainText,
                      fontWeight: FontWeight.w800,
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

class _DynamicThemeSuggestions extends StatelessWidget {
  const _DynamicThemeSuggestions({
    required this.eventType,
    required this.selectedThemes,
    required this.onThemeTap,
  });

  final String eventType;
  final Set<String> selectedThemes;
  final ValueChanged<String> onThemeTap;

  @override
  Widget build(BuildContext context) {
    final suggestedThemes = feastaSuggestedThemesForEvent(eventType);
    final otherThemes = feastaOtherThemesForEvent(eventType);
    final notSureSelected = selectedThemes.contains('Not sure yet');
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return AnimatedSwitcher(
      duration: reduceMotion
          ? Duration.zero
          : const Duration(milliseconds: 220),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (Widget child, Animation<double> animation) {
        final slideAnimation =
            Tween<Offset>(
              begin: const Offset(0, 0.04),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            );

        return FadeTransition(
          opacity: animation,
          child: SlideTransition(position: slideAnimation, child: child),
        );
      },
      child: Column(
        key: ValueKey<String>(eventType),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.primarySubtle,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.auto_awesome_rounded,
                  color: AppColors.primary,
                  size: 17,
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Text(
                  'Suggested for $eventType',
                  style: AppTypography.label.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: suggestedThemes
                .map((theme) {
                  return _ThemeChoiceChip(
                    label: theme,
                    selected: selectedThemes.contains(theme),
                    enabled: !notSureSelected,
                    onTap: () => onThemeTap(theme),
                  );
                })
                .toList(growable: false),
          ),
          if (otherThemes.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              'More themes',
              style: AppTypography.caption.copyWith(
                color: AppColors.secondaryTextAccessible,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: otherThemes
                  .map((theme) {
                    return _ThemeChoiceChip(
                      label: theme,
                      selected: selectedThemes.contains(theme),
                      enabled: !notSureSelected,
                      onTap: () => onThemeTap(theme),
                    );
                  })
                  .toList(growable: false),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              _ThemeChoiceChip(
                label: 'Custom theme',
                selected: selectedThemes.contains('Custom theme'),
                enabled: !notSureSelected,
                onTap: () => onThemeTap('Custom theme'),
              ),
              _ThemeChoiceChip(
                label: 'Not sure yet',
                selected: selectedThemes.contains('Not sure yet'),
                enabled: true,
                onTap: () => onThemeTap('Not sure yet'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ThemePreviewCard extends StatelessWidget {
  const _ThemePreviewCard({required this.themes, required this.customTheme});

  final List<String> themes;
  final String customTheme;

  @override
  Widget build(BuildContext context) {
    final labels = themes
        .map((theme) {
          if (theme == 'Custom theme' && customTheme.isNotEmpty) {
            return customTheme;
          }

          return theme;
        })
        .toList(growable: false);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
            child: const Icon(
              Icons.palette_outlined,
              color: AppColors.primary,
              size: 30,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  labels.join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.label.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'We’ll prioritize providers with matching portfolios.',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.3,
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

class _LocationSelectionCard extends StatelessWidget {
  const _LocationSelectionCard({
    required this.address,
    required this.loading,
    required this.onTap,
  });

  final CustomerAddressModel address;
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final title = loading ? 'Loading location…' : address.displayTitle;
    final subtitle = loading ? '' : address.displaySubtitle;

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
                    if (!loading && address.hasCoordinates) ...[
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

class _ScheduleCard extends StatelessWidget {
  const _ScheduleCard({
    required this.eventDate,
    required this.startTime,
    required this.endTime,
    required this.onDateTap,
    required this.onStartTap,
    required this.onEndTap,
  });

  final DateTime? eventDate;
  final TimeOfDay? startTime;
  final TimeOfDay? endTime;
  final VoidCallback onDateTap;
  final VoidCallback onStartTap;
  final VoidCallback onEndTap;

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
        children: [
          _ScheduleField(
            icon: Icons.calendar_month_outlined,
            label: 'Event date',
            value: _formatDate(eventDate),
            onTap: onDateTap,
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: _ScheduleField(
                  icon: Icons.schedule_outlined,
                  label: 'Start time',
                  value: _formatTime(context, startTime),
                  onTap: onStartTap,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _ScheduleField(
                  icon: Icons.schedule_rounded,
                  label: 'End time',
                  value: _formatTime(context, endTime),
                  onTap: onEndTap,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ScheduleField extends StatelessWidget {
  const _ScheduleField({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.background,
      borderRadius: BorderRadius.circular(AppRadius.large),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.large),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.sm),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.large),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Icon(icon, color: AppColors.primary, size: 20),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
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
                  hintText: 'Min ₱',
                  textInputAction: TextInputAction.next,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _BudgetField(
                  controller: maxController,
                  hintText: 'Max ₱',
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => onSubmitted(),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BudgetField extends StatelessWidget {
  const _BudgetField({
    required this.controller,
    required this.hintText,
    required this.textInputAction,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String hintText;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      textInputAction: textInputAction,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: hintText,
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

class _QuickServiceCard extends StatelessWidget {
  const _QuickServiceCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.large),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.large),
        child: Container(
          height: 92,
          padding: const EdgeInsets.all(AppSpacing.sm),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.large),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: AppColors.primary, size: 25),
              const SizedBox(height: AppSpacing.xs),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: AppTypography.caption.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
