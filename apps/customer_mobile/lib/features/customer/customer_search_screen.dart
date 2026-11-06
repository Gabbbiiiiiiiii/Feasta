import 'widgets/provider_grid.dart';
import 'widgets/event_schedule_card.dart';
import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'marketplace_availability.dart';
import 'widgets/provider_brand_visual.dart';
import 'package:flutter/material.dart';

import '../../core/services/occasion_catalog_service.dart';
import '../../core/helpers/provider_discovery.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/models/event_plan_preferences.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'customer_main_screen.dart';
import 'widgets/feasta_page_back_button.dart';

class CustomerSearchScreen extends StatefulWidget {
  const CustomerSearchScreen({
    super.key,
    this.initialQuery = '',
    this.initialCategoryCode,
    this.initialEventType = 'All',
    this.initialLocation = '',
    this.initialMinBudget,
    this.initialMaxBudget,
    this.autofocusSearch = false,
    this.initialShowFilters = false,
    this.onBack,
    this.repository,
    this.occasionLoader,
  });

  /// Optional provider/service keyword supplied by Home discovery.
  final String initialQuery;
  final FeastaRepository? repository;

  /// Optional offline catalog loader for widget tests.
  /// Production continues using the Firebase occasion catalog.
  final Future<List<CatalogOccasion>> Function()? occasionLoader;

  /// Stable File Maintenance category code used by category navigation.
  final String? initialCategoryCode;

  final String initialEventType;
  final String initialLocation;

  final double? initialMinBudget;
  final double? initialMaxBudget;

  final bool autofocusSearch;
  final bool initialShowFilters;

  /// Optional parent-provided fallback when this screen is embedded rather
  /// than pushed as a Navigator route.
  final VoidCallback? onBack;

  @override
  State<CustomerSearchScreen> createState() => _CustomerSearchScreenState();
}

class _CustomerSearchScreenState extends State<CustomerSearchScreen>
    with WidgetsBindingObserver {
  late final FeastaRepository _repository;
  late final Stream<List<ProviderModel>> _discoveryProviders;
  late final Future<Map<String, String>> _serviceCategoryNames;

  final TextEditingController _searchController = TextEditingController();

  final TextEditingController _locationController = TextEditingController();

  final TextEditingController _minBudgetController = TextEditingController();

  final TextEditingController _maxBudgetController = TextEditingController();
  final TextEditingController _guestCountController = TextEditingController();

  final EventPlanPreferencesService _planPreferencesService =
      EventPlanPreferencesService();

  final FocusNode _searchFocusNode = FocusNode();

  final List<String> _recentSearches = [];

  final OccasionCatalogService _occasionService = OccasionCatalogService();

  List<CatalogOccasion> _occasions = const <CatalogOccasion>[];
  bool _loadingOccasions = true;
  String? _occasionError;

  List<String> get _eventTypes => <String>[
    'All',
    ..._occasions.map((occasion) => occasion.id),
  ];

  Map<String, String> get _eventTypeLabels => <String, String>{
    'All': 'All',
    for (final occasion in _occasions) occasion.id: occasion.label,
  };

  Future<void> _loadOccasions() async {
    if (!mounted) return;

    setState(() {
      _loadingOccasions = true;
      _occasionError = null;
    });

    try {
      final occasions =
          await (widget.occasionLoader?.call() ??
              _occasionService.listActiveOccasions());

      if (!mounted) return;

      final resolved = _occasionService.resolveActiveId(
        widget.initialEventType,
        occasions,
      );

      setState(() {
        _occasions = occasions;
        _loadingOccasions = false;

        if (_selectedEventType != 'All' &&
            !occasions.any((item) => item.id == _selectedEventType)) {
          _selectedEventType = 'All';
        }

        if (resolved != null && !_occasionSelectionTouched) {
          _selectedEventType = resolved;
        }
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _occasions = const <CatalogOccasion>[];
        _selectedEventType = 'All';
        _loadingOccasions = false;
        _occasionError = 'Event types are temporarily unavailable.';
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      // Re-read the guest-accessible authoritative occasion catalog.
      _loadOccasions();
    }
  }

  bool _occasionSelectionTouched = false;

  String _selectedEventType = 'All';
  String? _selectedCategoryCode;

  DateTime? _eventDate;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;
  MarketplaceEventContext? _availabilityContext;
  String? _scheduleError;
  bool _showFilters = false;
  bool _showThemeFilters = false;
  bool _exactThemeMatchesOnly = false;
  bool _matchesEventPlan = false;
  final Set<String> _selectedThemes = <String>{};

  bool get _hasActiveSearch {
    return _selectedCategoryCode != null ||
        _searchController.text.trim().isNotEmpty ||
        _selectedEventType != 'All' ||
        _locationController.text.trim().isNotEmpty ||
        _minBudgetController.text.trim().isNotEmpty ||
        _maxBudgetController.text.trim().isNotEmpty ||
        _guestCountController.text.trim().isNotEmpty ||
        _selectedThemes.isNotEmpty ||
        _availabilityContext != null;
  }

  double? get _minBudget {
    final value = _minBudgetController.text.trim();

    if (value.isEmpty) {
      return null;
    }

    return double.tryParse(value);
  }

  double? get _maxBudget {
    final value = _maxBudgetController.text.trim();

    if (value.isEmpty) {
      return null;
    }

    return double.tryParse(value);
  }

  int get _activeFilterCount {
    var count = 0;

    if (_selectedEventType != 'All') {
      count++;
    }

    if (_locationController.text.trim().isNotEmpty) {
      count++;
    }

    if (_minBudgetController.text.trim().isNotEmpty ||
        _maxBudgetController.text.trim().isNotEmpty) {
      count++;
    }

    if (_guestCountController.text.trim().isNotEmpty) {
      count++;
    }

    if (_selectedThemes.isNotEmpty) {
      count++;
    }

    return count;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _selectedCategoryCode = widget.initialCategoryCode;
    _showFilters = widget.initialShowFilters;
    _repository = widget.repository ?? FeastaRepository();
    _discoveryProviders = _repository.searchAllVerifiedProviders(
      keyword: '',
      eventType: 'All',
      location: '',
      minBudget: null,
      maxBudget: null,
    );
    _serviceCategoryNames = _repository.getServiceCategoryNameMap();
    _loadOccasions();

    final initialQuery = widget.initialQuery.trim();

    if (initialQuery.isNotEmpty) {
      _searchController.text = initialQuery;

      _searchController.selection = TextSelection.collapsed(
        offset: _searchController.text.length,
      );
    }

    // The initial event type is resolved only after the active catalog
    // loads. Legacy display labels are not used as active filter values.

    _locationController.text = widget.initialLocation;

    if (widget.initialMinBudget != null) {
      _minBudgetController.text = widget.initialMinBudget!.toStringAsFixed(0);
    }

    if (widget.initialMaxBudget != null) {
      _maxBudgetController.text = widget.initialMaxBudget!.toStringAsFixed(0);
    }

    if (_selectedEventType != 'All' ||
        _locationController.text.isNotEmpty ||
        _minBudgetController.text.isNotEmpty ||
        _maxBudgetController.text.isNotEmpty) {
      _showFilters = true;
    }

    if (_showFilters) {
      _showFilters = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _toggleFilters();
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _searchController.dispose();
    _locationController.dispose();
    _minBudgetController.dispose();
    _maxBudgetController.dispose();
    _guestCountController.dispose();
    _searchFocusNode.dispose();

    super.dispose();
  }

  void _refreshSearch() {
    if (!mounted) {
      return;
    }

    setState(() {});
  }

  void _clearSearch() {
    _searchController.clear();
    _refreshSearch();
  }

  void _clearFilters() {
    setState(() {
      _locationController.clear();
      _minBudgetController.clear();
      _maxBudgetController.clear();
      _guestCountController.clear();
      _eventDate = null;
      _startTime = null;
      _endTime = null;
      _availabilityContext = null;
      _scheduleError = null;
      _selectedThemes.clear();
      _exactThemeMatchesOnly = false;
      _matchesEventPlan = false;
      _selectedEventType = 'All';
      _occasionSelectionTouched = true;
      _selectedCategoryCode = null;
    });
  }

  void _clearEverything() {
    setState(() {
      _searchController.clear();
      _locationController.clear();
      _minBudgetController.clear();
      _maxBudgetController.clear();
      _guestCountController.clear();
      _eventDate = null;
      _startTime = null;
      _endTime = null;
      _availabilityContext = null;
      _scheduleError = null;
      _selectedThemes.clear();
      _exactThemeMatchesOnly = false;
      _matchesEventPlan = false;
      _selectedEventType = 'All';
      _occasionSelectionTouched = true;
      _selectedCategoryCode = null;
    });
  }

  void _saveRecentSearch(String value) {
    final search = value.trim();

    if (search.isEmpty) {
      return;
    }

    setState(() {
      _recentSearches.remove(search);
      _recentSearches.insert(0, search);

      if (_recentSearches.length > 5) {
        _recentSearches.removeLast();
      }
    });
  }

  void _applySearchValue(String value) {
    setState(() {
      _searchController.text = value;

      _searchController.selection = TextSelection.collapsed(
        offset: _searchController.text.length,
      );

      _recentSearches.remove(value);
      _recentSearches.insert(0, value);

      if (_recentSearches.length > 5) {
        _recentSearches.removeLast();
      }
    });
  }

  int? get _guestCount {
    final value = int.tryParse(_guestCountController.text.trim());

    if (value == null || value <= 0) {
      return null;
    }

    return value;
  }

  Future<void> _loadThemesFromEventPlan(bool enabled) async {
    if (!enabled) {
      setState(() {
        _matchesEventPlan = false;
        _selectedThemes.clear();
      });
      return;
    }

    final saved = await _planPreferencesService.load();

    if (!mounted) {
      return;
    }

    setState(() {
      _matchesEventPlan = true;
      _selectedThemes
        ..clear()
        ..addAll(
          saved.themes.where((theme) => theme != 'Not sure yet').take(3),
        );

      if (saved.guestCount != null &&
          _guestCountController.text.trim().isEmpty) {
        _guestCountController.text = saved.guestCount.toString();
      }
    });
  }

  void _toggleSearchTheme(String theme) {
    if (theme == 'Not sure yet') {
      setState(() {
        _matchesEventPlan = false;
        _selectedThemes
          ..clear()
          ..add('Not sure yet');
        _exactThemeMatchesOnly = false;
      });
      return;
    }

    setState(() {
      _matchesEventPlan = false;
      _selectedThemes.remove('Not sure yet');

      if (_selectedThemes.contains(theme)) {
        _selectedThemes.remove(theme);
      } else if (_selectedThemes.length < 3) {
        _selectedThemes.add(theme);
      } else {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            const SnackBar(content: Text('You can choose up to 3 themes.')),
          );
      }

      if (_selectedThemes.isEmpty) {
        _exactThemeMatchesOnly = false;
      }
    });
  }

  void _handleBack() {
    FocusManager.instance.primaryFocus?.unfocus();

    final navigator = Navigator.of(context);

    if (navigator.canPop()) {
      navigator.pop();
      return;
    }

    if (widget.onBack != null) {
      widget.onBack!();
      return;
    }

    navigator.pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => const CustomerMainScreen(initialIndex: 0),
      ),
      (_) => false,
    );
  }

  Future<void> _toggleFilters() async {
    FocusScope.of(context).unfocus();
    setState(() => _showFilters = true);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, sheetSetState) {
          void update(VoidCallback action) {
            setState(action);
            sheetSetState(() {});
          }

          return SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.only(
                bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Event schedule',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F4C3A),
                          ),
                        ),
                        const SizedBox(height: 8),
                        const SizedBox(height: 12),
                        EventScheduleCard(
                          eventDate: _eventDate,
                          startTime: _startTime,
                          endTime: _endTime,
                          onDateTap: () async {
                            final manila = DateTime.now().toUtc().add(
                              const Duration(hours: 8),
                            );
                            final today = DateTime(
                              manila.year,
                              manila.month,
                              manila.day,
                            );
                            final value = await showDatePicker(
                              context: context,
                              firstDate: today,
                              lastDate: DateTime(today.year + 5),
                              initialDate:
                                  _eventDate != null &&
                                      !_eventDate!.isBefore(today)
                                  ? _eventDate!
                                  : today,
                            );
                            if (value != null && mounted && context.mounted) {
                              update(() => _eventDate = value);
                            }
                          },
                          onStartTap: () async {
                            final value = await showTimePicker(
                              context: context,
                              initialTime:
                                  _startTime ??
                                  const TimeOfDay(hour: 9, minute: 0),
                            );
                            if (value != null && mounted && context.mounted) {
                              update(() => _startTime = value);
                            }
                          },
                          onEndTap: () async {
                            final value = await showTimePicker(
                              context: context,
                              initialTime:
                                  _endTime ??
                                  const TimeOfDay(hour: 17, minute: 0),
                            );
                            if (value != null && mounted && context.mounted) {
                              update(() => _endTime = value);
                            }
                          },
                        ),
                        const SizedBox(height: 10),
                        const Text(
                          'Philippine time. Add your guest count below to check availability.',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.secondaryTextAccessible,
                          ),
                        ),
                        if (_scheduleError != null)
                          Semantics(
                            liveRegion: true,
                            child: Text(
                              _scheduleError!,
                              style: const TextStyle(color: AppColors.error),
                            ),
                          ),
                      ],
                    ),
                  ),
                  _SearchFilterPanel(
                    locationController: _locationController,
                    minBudgetController: _minBudgetController,
                    maxBudgetController: _maxBudgetController,
                    guestCountController: _guestCountController,
                    selectedThemes: _selectedThemes,
                    showThemeFilters: _showThemeFilters,
                    matchesEventPlan: _matchesEventPlan,
                    exactThemeMatchesOnly: _exactThemeMatchesOnly,
                    selectedEventType: _selectedEventType,
                    eventTypes: _eventTypes,
                    eventTypeLabels: _eventTypeLabels,
                    loadingOccasions: _loadingOccasions,
                    occasionError: _occasionError,
                    onRetryOccasions: _loadOccasions,
                    onSelectedEventType: (value) {
                      update(() {
                        _selectedEventType = value;
                        _occasionSelectionTouched = true;
                      });
                    },
                    onChanged: () {
                      _refreshSearch();
                      sheetSetState(() {});
                    },
                    onToggleThemeSection: () {
                      update(() {
                        _showThemeFilters = !_showThemeFilters;
                      });
                    },
                    onThemeTap: _toggleSearchTheme,
                    onMatchesEventPlanChanged: _loadThemesFromEventPlan,
                    onExactThemeMatchesChanged: (value) {
                      update(() {
                        _exactThemeMatchesOnly = value;
                      });
                    },
                    onClear: () {
                      _clearFilters();
                      sheetSetState(() {});
                    },
                    onApply: () {
                      MarketplaceEventContext? next;
                      if (_eventDate != null ||
                          _startTime != null ||
                          _endTime != null) {
                        String clock(TimeOfDay value) =>
                            '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
                        final date = _eventDate;
                        if (date == null ||
                            _startTime == null ||
                            _endTime == null) {
                          update(
                            () => _scheduleError =
                                'Choose an event date, start time and end time.',
                          );
                          return;
                        }
                        next = MarketplaceEventContext(
                          eventDate:
                              '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
                          eventTime: clock(_startTime!),
                          eventEndTime: clock(_endTime!),
                          guestCount:
                              int.tryParse(_guestCountController.text.trim()) ??
                              0,
                        );
                        final error = next.validate(DateTime.now());
                        if (error != null) {
                          update(() => _scheduleError = error);
                          return;
                        }
                      }
                      update(() {
                        _availabilityContext = next;
                        _scheduleError = null;
                      });
                      FocusScope.of(context).unfocus();

                      update(() {
                        _showFilters = false;
                      });

                      _refreshSearch();
                      Navigator.pop(context);
                    },
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (mounted) setState(() => _showFilters = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screen,
                AppSpacing.sm,
                AppSpacing.screen,
                AppSpacing.sm,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  FeastaPageBackButton(
                    semanticLabel: 'Back from Search',
                    onPressed: _handleBack,
                  ),
                  const SizedBox(width: AppSpacing.xxs),
                  Expanded(
                    child: Text(
                      'Find event services',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.label.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screen,
              ),
              child: Material(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppRadius.large),
                child: TextField(
                  controller: _searchController,
                  focusNode: _searchFocusNode,
                  autofocus: false,
                  textInputAction: TextInputAction.search,
                  onChanged: (_) {
                    _refreshSearch();
                  },
                  onSubmitted: (value) {
                    _saveRecentSearch(value);
                    FocusScope.of(context).unfocus();
                  },
                  style: AppTypography.body.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w600,
                  ),
                  decoration: InputDecoration(
                    hintText: 'Search caterers, packages, and services',
                    hintStyle: AppTypography.body.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                    prefixIcon: const Icon(
                      Icons.search_rounded,
                      color: customerDecorativeIconColor,
                    ),
                    suffixIcon: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_searchController.text.isNotEmpty)
                          IconButton(
                            tooltip: 'Clear search',
                            onPressed: _clearSearch,
                            icon: const Icon(
                              Icons.close_rounded,
                              color: AppColors.secondaryTextAccessible,
                            ),
                          ),
                        _FilterButton(
                          activeCount: _activeFilterCount,
                          isOpen: _showFilters,
                          onPressed: _toggleFilters,
                        ),
                        const SizedBox(width: 6),
                      ],
                    ),
                    filled: true,
                    fillColor: AppColors.surface,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.md,
                      vertical: AppSpacing.md,
                    ),
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
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Expanded(
              child: AnimatedSwitcher(
                duration: MediaQuery.of(context).disableAnimations
                    ? Duration.zero
                    : const Duration(milliseconds: 180),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                child: KeyedSubtree(
                  key: const ValueKey<String>('search-content'),
                  child: FutureBuilder<Map<String, String>>(
                    future: _serviceCategoryNames,
                    builder: (context, categorySnapshot) {
                      final categoryNames =
                          categorySnapshot.data ?? const <String, String>{};

                      return _hasActiveSearch
                          ? _SearchResultsList(
                              availabilityContext: _availabilityContext,
                              providersStream: _discoveryProviders,
                              searchController: _searchController,
                              categoryCode: _selectedCategoryCode,
                              selectedEventType: _selectedEventType,
                              locationController: _locationController,
                              minBudget: _minBudget,
                              maxBudget: _maxBudget,
                              guestCount: _guestCount,
                              selectedThemes: _selectedThemes,
                              exactThemeMatchesOnly: _exactThemeMatchesOnly,
                              categoryNames: categoryNames,
                              onReset: _clearEverything,
                            )
                          : _SearchLandingContent(
                              repository: _repository,
                              recentSearches: _recentSearches,
                              providersStream: _discoveryProviders,
                              onCategoryTap: (code) =>
                                  setState(() => _selectedCategoryCode = code),
                              categoryNames: categoryNames,
                              onSearchTap: _applySearchValue,
                            );
                    },
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({
    required this.activeCount,
    required this.isOpen,
    required this.onPressed,
  });

  final int activeCount;
  final bool isOpen;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: activeCount == 0
          ? 'Search filters'
          : 'Search filters, $activeCount active',
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          IconButton(
            tooltip: isOpen ? 'Hide filters' : 'Show filters',
            onPressed: onPressed,
            style: IconButton.styleFrom(backgroundColor: AppColors.surface),
            icon: Icon(
              isOpen ? Icons.tune_rounded : Icons.tune_outlined,
              color: customerDecorativeIconColor,
            ),
          ),
          if (activeCount > 0)
            Positioned(
              right: -2,
              top: -3,
              child: Container(
                constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                padding: const EdgeInsets.symmetric(horizontal: 5),
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  '$activeCount',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.surface,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SearchFilterPanel extends StatelessWidget {
  const _SearchFilterPanel({
    required this.locationController,
    required this.minBudgetController,
    required this.maxBudgetController,
    required this.guestCountController,
    required this.selectedThemes,
    required this.showThemeFilters,
    required this.matchesEventPlan,
    required this.exactThemeMatchesOnly,
    required this.selectedEventType,
    required this.eventTypes,
    required this.eventTypeLabels,
    required this.loadingOccasions,
    required this.occasionError,
    required this.onRetryOccasions,
    required this.onSelectedEventType,
    required this.onChanged,
    required this.onToggleThemeSection,
    required this.onThemeTap,
    required this.onMatchesEventPlanChanged,
    required this.onExactThemeMatchesChanged,
    required this.onClear,
    required this.onApply,
  });

  final TextEditingController locationController;
  final TextEditingController minBudgetController;
  final TextEditingController maxBudgetController;
  final TextEditingController guestCountController;

  final Set<String> selectedThemes;
  final bool showThemeFilters;
  final bool matchesEventPlan;
  final bool exactThemeMatchesOnly;

  final String selectedEventType;
  final List<String> eventTypes;
  final Map<String, String> eventTypeLabels;
  final bool loadingOccasions;
  final String? occasionError;
  final VoidCallback onRetryOccasions;

  final ValueChanged<String> onSelectedEventType;
  final VoidCallback onChanged;
  final VoidCallback onToggleThemeSection;
  final ValueChanged<String> onThemeTap;
  final ValueChanged<bool> onMatchesEventPlanChanged;
  final ValueChanged<bool> onExactThemeMatchesChanged;
  final VoidCallback onClear;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.md,
        AppSpacing.screen,
        AppSpacing.lg,
      ),
      child: FeastaCard(
        padding: const EdgeInsets.all(AppSpacing.card),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Filters',
                    style: AppTypography.cardTitle.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: onClear,
                  child: Text(
                    'Clear',
                    style: AppTypography.label.copyWith(
                      color: AppColors.primaryStrong,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            if (loadingOccasions)
              const LinearProgressIndicator()
            else if (occasionError != null)
              Row(
                children: [
                  Expanded(child: Text(occasionError!)),
                  TextButton(
                    onPressed: onRetryOccasions,
                    child: const Text('Retry'),
                  ),
                ],
              )
            else if (eventTypes.length == 1)
              const Text('No active event types are available.'),
            DropdownButtonFormField<String>(
              key: ValueKey<String>(selectedEventType),
              initialValue: eventTypes.contains(selectedEventType)
                  ? selectedEventType
                  : 'All',
              decoration: const InputDecoration(
                labelText: 'Event type',
                prefixIcon: Icon(Icons.celebration_outlined),
              ),
              dropdownColor: AppColors.surface,
              style: AppTypography.body.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w600,
              ),
              items: eventTypes
                  .map(
                    (type) => DropdownMenuItem(
                      value: type,
                      child: Text(eventTypeLabels[type] ?? type),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                if (value == null) {
                  return;
                }

                onSelectedEventType(value);
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            FeastaTextField(
              label: 'Location',
              controller: locationController,
              hintText: 'e.g. Ormoc City',
              prefixIcon: const Icon(Icons.location_on_outlined),
              textInputAction: TextInputAction.next,
              onChanged: (_) {
                onChanged();
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            LayoutBuilder(
              builder: (context, constraints) {
                final stack =
                    constraints.maxWidth < 330 ||
                    MediaQuery.textScalerOf(context).scale(1) > 1.25;

                if (stack) {
                  return Column(
                    children: [
                      FeastaTextField(
                        label: 'Minimum budget',
                        controller: minBudgetController,
                        hintText: 'â‚±0',
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        prefixIcon: const Icon(Icons.payments_outlined),
                        onChanged: (_) {
                          onChanged();
                        },
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      FeastaTextField(
                        label: 'Maximum budget',
                        controller: maxBudgetController,
                        hintText: 'Any amount',
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        prefixIcon: const Icon(Icons.payments_outlined),
                        onChanged: (_) {
                          onChanged();
                        },
                      ),
                    ],
                  );
                }

                return Row(
                  children: [
                    Expanded(
                      child: FeastaTextField(
                        label: 'Min budget',
                        controller: minBudgetController,
                        hintText: 'â‚±0',
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        onChanged: (_) {
                          onChanged();
                        },
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: FeastaTextField(
                        label: 'Max budget',
                        controller: maxBudgetController,
                        hintText: 'Any',
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        onChanged: (_) {
                          onChanged();
                        },
                      ),
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            FeastaTextField(
              label: 'How many guests?',
              controller: guestCountController,
              hintText: 'e.g. 50',
              keyboardType: TextInputType.number,
              prefixIcon: const Icon(Icons.groups_2_outlined),
              onChanged: (_) {
                onChanged();
              },
            ),

            const SizedBox(height: AppSpacing.md),

            const SizedBox(height: AppSpacing.lg),
            FeastaPrimaryButton(
              label: 'Apply filters',
              icon: const Icon(Icons.check_rounded),
              onPressed: onApply,
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchResultsList extends StatelessWidget {
  const _SearchResultsList({
    this.availabilityContext,
    required this.providersStream,
    required this.searchController,
    required this.categoryCode,
    required this.selectedEventType,
    required this.locationController,
    required this.minBudget,
    required this.maxBudget,
    required this.guestCount,
    required this.selectedThemes,
    required this.exactThemeMatchesOnly,
    required this.categoryNames,
    required this.onReset,
  });

  final MarketplaceEventContext? availabilityContext;
  final Stream<List<ProviderModel>> providersStream;

  final TextEditingController searchController;
  final String? categoryCode;
  final String selectedEventType;
  final TextEditingController locationController;

  final double? minBudget;
  final double? maxBudget;
  final int? guestCount;
  final Set<String> selectedThemes;
  final bool exactThemeMatchesOnly;
  final Map<String, String> categoryNames;

  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ProviderModel>>(
      stream: providersStream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const FeastaListSkeleton(
            itemCount: 5,
            showImage: true,
            padding: EdgeInsets.fromLTRB(
              AppSpacing.screen,
              AppSpacing.xs,
              AppSpacing.screen,
              AppSpacing.xl,
            ),
          );
        }

        if (snapshot.hasError) {
          return const FeastaApplicationErrorState(
            kind: FeastaErrorKind.load,
            message:
                'We couldn\'t load search results. Please check your connection and try again.',
          );
        }

        final rawProviders = (snapshot.data ?? const <ProviderModel>[])
            .where(
              (provider) => matchesProviderDiscovery(
                provider,
                keyword: searchController.text,
                categoryCode: categoryCode,
                eventType: selectedEventType,
                location: locationController.text,
                minBudget: minBudget,
                maxBudget: maxBudget,
              ),
            )
            .toList();

        final guestFiltered = guestCount == null || availabilityContext != null
            ? rawProviders
            : rawProviders.where((provider) {
                return provider.maxGuestsPerEvent > 0 &&
                    provider.maxGuestsPerEvent >= guestCount!;
              }).toList();

        final providers = guestFiltered
            .map(
              (provider) => _ThemeScoredProvider(
                provider: provider,
                score: _providerThemeScore(provider, selectedThemes),
              ),
            )
            .where((entry) {
              if (!exactThemeMatchesOnly || selectedThemes.isEmpty) {
                return true;
              }

              if (!_themeRelevantProvider(entry.provider)) {
                return true;
              }

              return entry.score > 0;
            })
            .toList();

        final keyword = searchController.text.trim();
        final originalOrder = {
          for (var index = 0; index < providers.length; index++)
            providers[index]: index,
        };
        providers.sort((a, b) {
          final relevance = providerBusinessNameSearchRank(
            a.provider,
            keyword,
          ).compareTo(providerBusinessNameSearchRank(b.provider, keyword));
          if (relevance != 0) return relevance;
          if (selectedThemes.isNotEmpty && !exactThemeMatchesOnly) {
            final themeOrder = b.score.compareTo(a.score);
            if (themeOrder != 0) return themeOrder;
          }
          // With no keyword, retain the existing discovery/theme ordering.
          if (keyword.isEmpty) {
            return originalOrder[a]!.compareTo(originalOrder[b]!);
          }
          return compareProviderSearchRelevance(
            a.provider,
            b.provider,
            keyword,
          );
        });

        if (providers.isEmpty) {
          return FeastaEmptyState(
            icon: Icons.search_off_rounded,
            title: 'No results found',
            message: 'Try changing your search keyword or filters.',
            actionLabel: 'Clear search',
            onAction: onReset,
          );
        }

        if (availabilityContext != null) {
          return _AvailabilityResults(
            key: ValueKey(
              '${availabilityContext!.key}/${providers.map((p) => p.provider.id).join(',')}',
            ),
            event: availabilityContext!,
            providers: providers.map((entry) => entry.provider).toList(),
            categoryNames: categoryNames,
          );
        }

        return ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
          children: [
            Text(
              '${providers.length} provider${providers.length == 1 ? '' : 's'} found',
              style: const TextStyle(
                color: AppColors.secondaryTextAccessible,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            ProviderCardGrid(
              itemCount: providers.length,
              itemBuilder: (context, index) => SearchProviderCard(
                provider: providers[index].provider,
                categoryNames: categoryNames,
              ),
            ),
          ],
        );
      },
    );
  }
}

class _SearchLandingContent extends StatelessWidget {
  const _SearchLandingContent({
    required this.repository,
    required this.recentSearches,
    required this.providersStream,
    required this.onCategoryTap,
    required this.categoryNames,
    required this.onSearchTap,
  });

  final FeastaRepository repository;

  final List<String> recentSearches;
  final Stream<List<ProviderModel>> providersStream;
  final ValueChanged<String> onCategoryTap;
  final Map<String, String> categoryNames;

  final ValueChanged<String> onSearchTap;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.xs,
        AppSpacing.screen,
        AppSpacing.xl,
      ),
      children: [
        if (recentSearches.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.section),
          const _SearchSectionTitle(title: 'Recent searches'),
          const SizedBox(height: AppSpacing.sm),
          FeastaCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < recentSearches.length; i++) ...[
                  _RecentSearchTile(
                    label: recentSearches[i],
                    onTap: () {
                      onSearchTap(recentSearches[i]);
                    },
                  ),
                  if (i != recentSearches.length - 1)
                    const Divider(
                      height: 1,
                      indent: 64,
                      color: AppColors.border,
                    ),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.section),
        StreamBuilder<List<ProviderModel>>(
          stream: providersStream,
          builder: (context, snapshot) {
            if (!snapshot.hasData || snapshot.hasError) {
              return const SizedBox.shrink();
            }
            final counts = <String, int>{};
            for (final provider in snapshot.data!) {
              for (final code
                  in (provider.serviceCategories ?? [provider.providerCategory])
                      .toSet()) {
                if (categoryNames.containsKey(code)) {
                  counts[code] = (counts[code] ?? 0) + 1;
                }
              }
            }
            final codes = counts.keys.toList()
              ..sort((a, b) {
                final popularity = counts[b]!.compareTo(counts[a]!);
                return popularity != 0
                    ? popularity
                    : categoryNames[a]!.compareTo(categoryNames[b]!);
              });
            if (codes.isEmpty) return const SizedBox.shrink();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SearchSectionTitle(
                  title: 'Popular searches',
                  subtitle: 'Explore services offered by current providers',
                ),
                const SizedBox(height: AppSpacing.md),
                Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  children: [
                    for (final code in codes.take(8))
                      _SearchChip(
                        label: categoryNames[code]!,
                        onTap: () => onCategoryTap(code),
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.section),
              ],
            );
          },
        ),
        const _SearchSectionTitle(
          title: 'Recommended caterers',
          subtitle: 'Popular providers for your next celebration',
        ),
        const SizedBox(height: AppSpacing.md),
        _ProviderMiniSlider(
          stream: repository.verifiedProviders(),
          categoryNames: categoryNames,
          emptyText: 'No recommended caterers available yet.',
        ),
        const SizedBox(height: AppSpacing.section),
        const _SearchSectionTitle(
          title: 'Event services',
          subtitle:
              'Photographers, coordinators, performers, rentals, and more',
        ),
        const SizedBox(height: AppSpacing.md),
        _ProviderMiniSlider(
          stream: repository.verifiedAddonProviders(),
          categoryNames: categoryNames,
          emptyText: 'No event service providers available yet.',
        ),
      ],
    );
  }
}

class _ProviderMiniSlider extends StatelessWidget {
  const _ProviderMiniSlider({
    required this.stream,
    required this.emptyText,
    required this.categoryNames,
  });

  final Stream<List<ProviderModel>> stream;
  final String emptyText;
  final Map<String, String> categoryNames;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ProviderModel>>(
      stream: stream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox(
            height: 218,
            child: FeastaSkeletonHorizontalCards(),
          );
        }

        if (snapshot.hasError) {
          return const _MiniSliderMessage(
            icon: Icons.error_outline_rounded,
            text: 'Unable to load providers right now.',
          );
        }

        final providers = (snapshot.data ?? const <ProviderModel>[])
            .take(6)
            .toList();

        if (providers.isEmpty) {
          return _MiniSliderMessage(
            icon: Icons.storefront_outlined,
            text: emptyText,
          );
        }

        return ProviderCardGrid(
          itemCount: providers.length,
          itemBuilder: (context, index) => SearchProviderCard(
            provider: providers[index],
            categoryNames: categoryNames,
          ),
        );
      },
    );
  }
}

class _MiniSliderMessage extends StatelessWidget {
  const _MiniSliderMessage({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      showShadow: false,
      showBorder: true,
      child: Row(
        children: [
          Icon(icon, color: AppColors.secondaryTextAccessible),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchSectionTitle extends StatelessWidget {
  const _SearchSectionTitle({required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w800,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: AppSpacing.xxs),
          Text(
            subtitle!,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ],
      ],
    );
  }
}

class _RecentSearchTile extends StatelessWidget {
  const _RecentSearchTile({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: const Icon(
                  Icons.history_rounded,
                  color: AppColors.secondaryTextAccessible,
                  size: AppSizes.iconMedium,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.label.copyWith(
                    color: AppColors.mainText,
                  ),
                ),
              ),
              const Icon(
                Icons.north_west_rounded,
                color: AppColors.secondaryTextAccessible,
                size: AppSizes.iconMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SearchChip extends StatelessWidget {
  const _SearchChip({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(label),
      avatar: const Icon(
        Icons.search_rounded,
        size: AppSizes.iconSmall,
        color: customerDecorativeIconColor,
      ),
      onPressed: onTap,
      backgroundColor: AppColors.surface,
      side: const BorderSide(color: AppColors.border),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      labelStyle: AppTypography.label.copyWith(color: AppColors.mainText),
    );
  }
}

class SearchProviderCard extends StatelessWidget {
  const SearchProviderCard({
    required this.provider,
    required this.categoryNames,
    this.themeMatchLabel,
    super.key,
  });
  final ProviderModel provider;
  final Map<String, String> categoryNames;
  final String? themeMatchLabel;
  @override
  Widget build(BuildContext context) =>
      ProviderGridCard(provider: provider, categoryNames: categoryNames);
}

class _ThemeScoredProvider {
  const _ThemeScoredProvider({required this.provider, required this.score});

  final ProviderModel provider;
  final int score;
}

bool _themeRelevantProvider(ProviderModel provider) {
  final category = normalizeThemeText(
    provider.providerCategory,
  ).replaceAll(' ', '_');

  if (feastaThemeRelevantCategories.contains(category)) {
    return true;
  }

  final serviceType = normalizeThemeText(provider.providerServiceType);

  return serviceType.contains('catering') || serviceType.contains('addon');
}

int _providerThemeScore(ProviderModel provider, Set<String> selectedThemes) {
  if (selectedThemes.isEmpty ||
      selectedThemes.contains('Not sure yet') ||
      !_themeRelevantProvider(provider)) {
    return 0;
  }

  final searchable = normalizeThemeText(
    '${provider.businessName} '
    '${provider.description} '
    '${provider.providerCategory} '
    '${provider.eventTypesSupported.join(' ')}',
  );

  var score = 0;

  for (final theme in selectedThemes) {
    if (theme == 'Custom theme') {
      continue;
    }

    final normalized = normalizeThemeText(theme);

    if (normalized.isNotEmpty && searchable.contains(normalized)) {
      score += 2;
    }
  }

  return score;
}

class _AvailabilityResults extends StatefulWidget {
  const _AvailabilityResults({
    required this.event,
    required this.providers,
    required this.categoryNames,
    super.key,
  });
  final MarketplaceEventContext event;
  final List<ProviderModel> providers;
  final Map<String, String> categoryNames;
  @override
  State<_AvailabilityResults> createState() => _AvailabilityResultsState();
}

class _AvailabilityResultsState extends State<_AvailabilityResults> {
  late Future<List<MarketplaceAvailability>> _check;
  StreamSubscription<User?>? _account;
  String? _uid;
  @override
  void initState() {
    super.initState();
    _uid = FirebaseAuth.instance.currentUser?.uid;
    _check = _load();
    _account = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (mounted && user?.uid != _uid) {
        setState(() {
          _uid = user?.uid;
          _check = _load();
        });
      }
    });
  }

  @override
  void dispose() {
    _account?.cancel();
    super.dispose();
  }

  Future<List<MarketplaceAvailability>> _load() => checkMarketplaceAvailability(
    widget.providers.map((p) => p.id).toList(),
    widget.event,
  );
  @override
  Widget build(
    BuildContext context,
  ) => FutureBuilder<List<MarketplaceAvailability>>(
    future: _check,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Checking provider availability…'),
            ],
          ),
        );
      }
      if (snapshot.hasError) {
        return FeastaEmptyState(
          icon: Icons.event_busy_outlined,
          title: 'Availability could not be checked',
          message:
              'Sign in and check your connection, then retry. Availability has not been confirmed.',
          actionLabel: 'Retry availability',
          onAction: () => setState(() => _check = _load()),
        );
      }
      final results = {
        for (final item in snapshot.data!) item.providerId: item,
      };
      final providers = [...widget.providers]
        ..sort(
          (a, b) => (results[b.id]!.available ? 1 : 0).compareTo(
            results[a.id]!.available ? 1 : 0,
          ),
        );
      return ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          Text(
            '${results.values.where((r) => r.available).length} available providers',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F4C3A),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${widget.event.eventDate} • ${widget.event.eventTime}–${widget.event.eventEndTime} Philippine time • ${widget.event.guestCount} guests',
          ),
          const SizedBox(height: 8),
          const Text(
            'This is not a reservation; availability is checked again when booking.',
          ),
          const SizedBox(height: 16),
          ProviderCardGrid(
            itemCount: providers.length,
            itemBuilder: (context, index) {
              final provider = providers[index];
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SearchProviderCard(
                    provider: provider,
                    categoryNames: widget.categoryNames,
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(
                      results[provider.id]!.message,
                      style: TextStyle(
                        fontSize: 12,
                        color: results[provider.id]!.available
                            ? AppColors.success
                            : AppColors.error,
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      );
    },
  );
}
