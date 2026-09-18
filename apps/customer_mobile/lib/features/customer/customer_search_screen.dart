import 'package:flutter/material.dart';

import '../../core/helpers/provider_category_helper.dart';
import '../../core/theme/app_breakpoints.dart';
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
import 'provider_profile_screen.dart';
import 'widgets/feasta_page_back_button.dart';

class CustomerSearchScreen extends StatefulWidget {
  const CustomerSearchScreen({
    super.key,
    this.initialQuery = '',
    this.initialEventType = 'All',
    this.initialLocation = '',
    this.initialMinBudget,
    this.initialMaxBudget,
    this.autofocusSearch = false,
    this.onBack,
  });

  /// Optional provider/service keyword supplied by Home discovery.
  final String initialQuery;

  final String initialEventType;
  final String initialLocation;

  final double? initialMinBudget;
  final double? initialMaxBudget;

  final bool autofocusSearch;

  /// Optional parent-provided fallback when this screen is embedded rather
  /// than pushed as a Navigator route.
  final VoidCallback? onBack;

  @override
  State<CustomerSearchScreen> createState() => _CustomerSearchScreenState();
}

class _CustomerSearchScreenState extends State<CustomerSearchScreen> {
  late final FeastaRepository _repository;

  final TextEditingController _searchController = TextEditingController();

  final TextEditingController _locationController = TextEditingController();

  final TextEditingController _minBudgetController = TextEditingController();

  final TextEditingController _maxBudgetController = TextEditingController();
  final TextEditingController _guestCountController = TextEditingController();

  final EventPlanPreferencesService _planPreferencesService =
      EventPlanPreferencesService();

  final FocusNode _searchFocusNode = FocusNode();

  final List<String> _recentSearches = [];

  static const List<String> _popularSearches = [
    'Catering Service',
    'Photographer',
    'Event Coordinator',
    'Singer / Band',
    'Lights and Sounds',
    'Photo Booth',
    'Cake Provider',
    'Venue Provider',
    'Car Rental',
  ];

  static const List<String> _eventTypes = [
    'All',
    'Birthday',
    'Wedding',
    'Anniversary',
    'Reunion',
    'Corporate',
    'Baptism',
    'Graduation',
    'Other',
  ];

  String _selectedEventType = 'All';

  bool _showFilters = false;
  bool _showThemeFilters = false;
  bool _exactThemeMatchesOnly = false;
  bool _matchesEventPlan = false;
  final Set<String> _selectedThemes = <String>{};

  bool get _hasActiveSearch {
    return _searchController.text.trim().isNotEmpty ||
        _selectedEventType != 'All' ||
        _locationController.text.trim().isNotEmpty ||
        _minBudgetController.text.trim().isNotEmpty ||
        _maxBudgetController.text.trim().isNotEmpty ||
        _guestCountController.text.trim().isNotEmpty ||
        _selectedThemes.isNotEmpty;
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

    _repository = FeastaRepository();

    final initialQuery = widget.initialQuery.trim();

    if (initialQuery.isNotEmpty) {
      _searchController.text = initialQuery;

      _searchController.selection = TextSelection.collapsed(
        offset: _searchController.text.length,
      );
    }

    if (_eventTypes.contains(widget.initialEventType)) {
      _selectedEventType = widget.initialEventType;
    }

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

    if (widget.autofocusSearch) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }

        _searchFocusNode.requestFocus();
      });
    }
  }

  @override
  void dispose() {
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
      _selectedThemes.clear();
      _exactThemeMatchesOnly = false;
      _matchesEventPlan = false;
      _selectedEventType = 'All';
    });
  }

  void _clearEverything() {
    setState(() {
      _searchController.clear();
      _locationController.clear();
      _minBudgetController.clear();
      _maxBudgetController.clear();
      _guestCountController.clear();
      _selectedThemes.clear();
      _exactThemeMatchesOnly = false;
      _matchesEventPlan = false;
      _selectedEventType = 'All';
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

  void _toggleFilters() {
    setState(() {
      _showFilters = !_showFilters;
    });
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
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Search',
                          style: AppTypography.title.copyWith(
                            color: AppColors.mainText,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xxs),
                        Text(
                          'Find caterers and event services for your celebration.',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.bodySmall.copyWith(
                            color: AppColors.secondaryTextAccessible,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  _FilterButton(
                    activeCount: _activeFilterCount,
                    isOpen: _showFilters,
                    onPressed: _toggleFilters,
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
                  autofocus: widget.autofocusSearch,
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
                      color: AppColors.mainText,
                    ),
                    suffixIcon: _searchController.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear search',
                            onPressed: _clearSearch,
                            icon: const Icon(
                              Icons.close_rounded,
                              color: AppColors.secondaryTextAccessible,
                            ),
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
                child: _showFilters
                    ? SingleChildScrollView(
                        key: const ValueKey<String>('search-filters'),
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        physics: const ClampingScrollPhysics(),
                        padding: EdgeInsets.only(
                          bottom:
                              MediaQuery.viewInsetsOf(context).bottom +
                              AppSpacing.lg,
                        ),
                        child: _SearchFilterPanel(
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
                          onSelectedEventType: (value) {
                            setState(() {
                              _selectedEventType = value;
                            });
                          },
                          onChanged: _refreshSearch,
                          onToggleThemeSection: () {
                            setState(() {
                              _showThemeFilters = !_showThemeFilters;
                            });
                          },
                          onThemeTap: _toggleSearchTheme,
                          onMatchesEventPlanChanged: _loadThemesFromEventPlan,
                          onExactThemeMatchesChanged: (value) {
                            setState(() {
                              _exactThemeMatchesOnly = value;
                            });
                          },
                          onClear: _clearFilters,
                          onApply: () {
                            FocusScope.of(context).unfocus();

                            setState(() {
                              _showFilters = false;
                            });

                            _refreshSearch();
                          },
                        ),
                      )
                    : KeyedSubtree(
                        key: const ValueKey<String>('search-content'),
                        child: _hasActiveSearch
                            ? _SearchResultsList(
                                repository: _repository,
                                searchController: _searchController,
                                selectedEventType: _selectedEventType,
                                locationController: _locationController,
                                minBudget: _minBudget,
                                maxBudget: _maxBudget,
                                guestCount: _guestCount,
                                selectedThemes: _selectedThemes,
                                exactThemeMatchesOnly: _exactThemeMatchesOnly,
                                onReset: _clearEverything,
                              )
                            : _SearchLandingContent(
                                repository: _repository,
                                recentSearches: _recentSearches,
                                popularSearches: _popularSearches,
                                onSearchTap: _applySearchValue,
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
            style: IconButton.styleFrom(
              backgroundColor: AppColors.surface,
              side: const BorderSide(color: AppColors.border),
            ),
            icon: Icon(
              isOpen ? Icons.tune_rounded : Icons.tune_outlined,
              color: AppColors.mainText,
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
            DropdownButtonFormField<String>(
              initialValue: selectedEventType,
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
                    (type) => DropdownMenuItem(value: type, child: Text(type)),
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
                        hintText: '₱0',
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
                        hintText: '₱0',
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

            Material(
              color: AppColors.surfaceMuted,
              borderRadius: BorderRadius.circular(AppRadius.large),
              child: InkWell(
                onTap: onToggleThemeSection,
                borderRadius: BorderRadius.circular(AppRadius.large),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.sm,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.primarySubtle,
                          borderRadius: BorderRadius.circular(AppRadius.medium),
                        ),
                        child: const Icon(
                          Icons.palette_outlined,
                          color: AppColors.primary,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Theme & Style',
                              style: AppTypography.label.copyWith(
                                color: AppColors.mainText,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              selectedThemes.isEmpty
                                  ? 'Optional'
                                  : '${selectedThemes.length} selected',
                              style: AppTypography.caption.copyWith(
                                color: AppColors.secondaryTextAccessible,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Icon(
                        showThemeFilters
                            ? Icons.keyboard_arrow_up_rounded
                            : Icons.keyboard_arrow_down_rounded,
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ],
                  ),
                ),
              ),
            ),

            AnimatedSize(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutCubic,
              child: !showThemeFilters
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SwitchListTile.adaptive(
                            contentPadding: EdgeInsets.zero,
                            value: matchesEventPlan,
                            activeTrackColor: AppColors.primary,
                            title: Text(
                              'Matches my event plan',
                              style: AppTypography.label.copyWith(
                                color: AppColors.mainText,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            subtitle: Text(
                              'Load themes saved in Plan Your Event',
                              style: AppTypography.caption.copyWith(
                                color: AppColors.secondaryTextAccessible,
                              ),
                            ),
                            onChanged: onMatchesEventPlanChanged,
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Wrap(
                            spacing: AppSpacing.xs,
                            runSpacing: AppSpacing.xs,
                            children: feastaThemeOptions.map((theme) {
                              final selected = selectedThemes.contains(theme);

                              return FilterChip(
                                label: Text(theme),
                                selected: selected,
                                onSelected: (_) => onThemeTap(theme),
                                selectedColor: AppColors.primarySubtle,
                                backgroundColor: AppColors.surface,
                                checkmarkColor: AppColors.primaryStrong,
                                side: BorderSide(
                                  color: selected
                                      ? AppColors.primary
                                      : AppColors.border,
                                ),
                                labelStyle: AppTypography.caption.copyWith(
                                  color: selected
                                      ? AppColors.primaryStrong
                                      : AppColors.mainText,
                                  fontWeight: FontWeight.w700,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(
                                    AppRadius.pill,
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          SwitchListTile.adaptive(
                            contentPadding: EdgeInsets.zero,
                            value: exactThemeMatchesOnly,
                            activeTrackColor: AppColors.primary,
                            title: Text(
                              'Exact theme matches only',
                              style: AppTypography.label.copyWith(
                                color: AppColors.mainText,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            subtitle: Text(
                              'Off keeps other suitable providers visible',
                              style: AppTypography.caption.copyWith(
                                color: AppColors.secondaryTextAccessible,
                              ),
                            ),
                            onChanged: selectedThemes.isEmpty
                                ? null
                                : onExactThemeMatchesChanged,
                          ),
                        ],
                      ),
                    ),
            ),

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
    required this.repository,
    required this.searchController,
    required this.selectedEventType,
    required this.locationController,
    required this.minBudget,
    required this.maxBudget,
    required this.guestCount,
    required this.selectedThemes,
    required this.exactThemeMatchesOnly,
    required this.onReset,
  });

  final FeastaRepository repository;

  final TextEditingController searchController;
  final String selectedEventType;
  final TextEditingController locationController;

  final double? minBudget;
  final double? maxBudget;
  final int? guestCount;
  final Set<String> selectedThemes;
  final bool exactThemeMatchesOnly;

  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ProviderModel>>(
      stream: repository.searchAllVerifiedProviders(
        keyword: searchController.text,
        eventType: selectedEventType,
        location: locationController.text,
        minBudget: minBudget,
        maxBudget: maxBudget,
      ),
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

        final rawProviders = snapshot.data ?? const <ProviderModel>[];

        final guestFiltered = guestCount == null
            ? rawProviders
            : rawProviders.where((provider) {
                return provider.maxGuestsPerEvent <= 0 ||
                    provider.maxGuestsPerEvent >= guestCount!;
              }).toList();

        final providers =
            guestFiltered
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
                .toList()
              ..sort((a, b) {
                if (selectedThemes.isEmpty || exactThemeMatchesOnly) {
                  return 0;
                }

                return b.score.compareTo(a.score);
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

        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.xs,
            AppSpacing.screen,
            AppSpacing.xl,
          ),
          itemCount: providers.length + 1,
          separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
          itemBuilder: (context, index) {
            if (index == 0) {
              return Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Text(
                  '${providers.length} '
                  'provider'
                  '${providers.length == 1 ? '' : 's'} '
                  'found',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              );
            }

            final entry = providers[index - 1];

            return SearchProviderCard(
              provider: entry.provider,
              themeMatchLabel: entry.score > 0 && selectedThemes.isNotEmpty
                  ? _themeMatchLabel(entry.provider, selectedThemes)
                  : null,
            );
          },
        );
      },
    );
  }
}

class _SearchLandingContent extends StatelessWidget {
  const _SearchLandingContent({
    required this.repository,
    required this.recentSearches,
    required this.popularSearches,
    required this.onSearchTap,
  });

  final FeastaRepository repository;

  final List<String> recentSearches;
  final List<String> popularSearches;

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
        const _SearchSectionTitle(
          title: 'Popular services',
          subtitle: 'Explore services for your next event',
        ),
        const SizedBox(height: AppSpacing.md),
        _PopularServiceRail(onSearchTap: onSearchTap),
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
        const _SearchSectionTitle(
          title: 'Popular searches',
          subtitle: 'Quickly browse common event services',
        ),
        const SizedBox(height: AppSpacing.md),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: popularSearches
              .map(
                (search) => _SearchChip(
                  label: search,
                  onTap: () {
                    onSearchTap(search);
                  },
                ),
              )
              .toList(),
        ),
        const SizedBox(height: AppSpacing.section),
        const _SearchSectionTitle(
          title: 'Recommended caterers',
          subtitle: 'Popular providers for your next celebration',
        ),
        const SizedBox(height: AppSpacing.md),
        _ProviderMiniSlider(
          stream: repository.verifiedProviders(),
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
          emptyText: 'No event service providers available yet.',
        ),
      ],
    );
  }
}

class _PopularServiceRail extends StatelessWidget {
  const _PopularServiceRail({required this.onSearchTap});

  final ValueChanged<String> onSearchTap;

  static const List<_PopularServiceShortcut> _items = [
    _PopularServiceShortcut(
      label: 'Catering',
      searchValue: 'Catering Service',
      icon: Icons.restaurant_menu_rounded,
    ),
    _PopularServiceShortcut(
      label: 'Photo',
      searchValue: 'Photographer',
      icon: Icons.photo_camera_rounded,
    ),
    _PopularServiceShortcut(
      label: 'Cake',
      searchValue: 'Cake Provider',
      icon: Icons.cake_rounded,
    ),
    _PopularServiceShortcut(
      label: 'Venue',
      searchValue: 'Venue Provider',
      icon: Icons.location_city_rounded,
    ),
    _PopularServiceShortcut(
      label: 'Music',
      searchValue: 'Singer / Band',
      icon: Icons.music_note_rounded,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 122,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _items.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, index) {
          final item = _items[index];

          return _ServiceShortcutCard(
            item: item,
            onTap: () {
              onSearchTap(item.searchValue ?? item.label);
            },
          );
        },
      ),
    );
  }
}

class _PopularServiceShortcut {
  const _PopularServiceShortcut({
    required this.label,
    required this.icon,
    this.searchValue,
  });

  final String label;
  final String? searchValue;
  final IconData icon;
}

class _ServiceShortcutCard extends StatelessWidget {
  const _ServiceShortcutCard({required this.item, required this.onTap});

  final _PopularServiceShortcut item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Search ${item.label}',
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.card),
        onTap: onTap,
        child: SizedBox(
          width: 94,
          child: Column(
            children: [
              Container(
                width: 94,
                height: 82,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppRadius.card),
                  border: Border.all(color: AppColors.border),
                ),
                child: Container(
                  width: 46,
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.primarySubtle,
                    borderRadius: BorderRadius.circular(AppRadius.medium),
                  ),
                  child: Icon(item.icon, size: 25, color: AppColors.primary),
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                item.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: AppTypography.caption.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProviderMiniSlider extends StatelessWidget {
  const _ProviderMiniSlider({required this.stream, required this.emptyText});

  final Stream<List<ProviderModel>> stream;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 218,
      child: StreamBuilder<List<ProviderModel>>(
        stream: stream,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const FeastaSkeletonHorizontalCards();
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

          return ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: providers.length,
            separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
            itemBuilder: (context, index) {
              return _MiniProviderCard(provider: providers[index]);
            },
          );
        },
      ),
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
        color: AppColors.primary,
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

class _MiniProviderCard extends StatelessWidget {
  const _MiniProviderCard({required this.provider});

  final ProviderModel provider;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 190,
      child: FeastaCard(
        padding: EdgeInsets.zero,
        onTap: () {
          _openProvider(context, provider);
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppRadius.card),
              ),
              child: SizedBox(
                height: 104,
                width: double.infinity,
                child: FeastaImage.network(
                  imageUrl: provider.coverImageUrl,
                  description: '${provider.businessName} cover image',
                  fallbackLabel: '${provider.businessName} image unavailable',
                  width: double.infinity,
                  height: 104,
                  borderRadius: 0,
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      provider.businessName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.cardTitle.copyWith(
                        color: AppColors.mainText,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      providerCategoryLabel(provider.providerCategory),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.primaryStrong,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const Spacer(),
                    _ProviderRating(provider: provider),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SearchProviderCard extends StatelessWidget {
  const SearchProviderCard({
    super.key,
    required this.provider,
    this.themeMatchLabel,
  });

  final ProviderModel provider;
  final String? themeMatchLabel;

  @override
  Widget build(BuildContext context) {
    final textScale = MediaQuery.textScalerOf(context).scale(1);

    final width = MediaQuery.sizeOf(context).width;

    final useVerticalLayout = width < AppBreakpoints.tablet && textScale > 1.35;

    if (useVerticalLayout) {
      return _VerticalSearchProviderCard(
        provider: provider,
        themeMatchLabel: themeMatchLabel,
      );
    }

    return FeastaCard(
      padding: EdgeInsets.zero,
      onTap: () {
        _openProvider(context, provider);
      },
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: width < AppBreakpoints.tablet ? 112 : 150,
              child: ClipRRect(
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(AppRadius.card),
                ),
                child: FeastaImage.network(
                  imageUrl: provider.coverImageUrl,
                  description: '${provider.businessName} cover image',
                  fallbackLabel: '${provider.businessName} image unavailable',
                  height: double.infinity,
                  borderRadius: 0,
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: _SearchProviderDetails(
                  provider: provider,
                  themeMatchLabel: themeMatchLabel,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VerticalSearchProviderCard extends StatelessWidget {
  const _VerticalSearchProviderCard({
    required this.provider,
    this.themeMatchLabel,
  });

  final ProviderModel provider;
  final String? themeMatchLabel;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: EdgeInsets.zero,
      onTap: () {
        _openProvider(context, provider);
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppRadius.card),
            ),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: FeastaImage.network(
                imageUrl: provider.coverImageUrl,
                description: '${provider.businessName} cover image',
                fallbackLabel: '${provider.businessName} image unavailable',
                borderRadius: 0,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: _SearchProviderDetails(
              provider: provider,
              themeMatchLabel: themeMatchLabel,
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchProviderDetails extends StatelessWidget {
  const _SearchProviderDetails({required this.provider, this.themeMatchLabel});

  final ProviderModel provider;
  final String? themeMatchLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                provider.businessName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.cardTitle.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            if (provider.isApproved) ...[
              const SizedBox(width: AppSpacing.xs),
              const Tooltip(
                message: 'Verified provider',
                child: Icon(
                  Icons.verified_rounded,
                  color: AppColors.success,
                  size: AppSizes.iconMedium,
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Align(
          alignment: Alignment.centerLeft,
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xxs,
            ),
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Text(
              providerCategoryLabel(provider.providerCategory),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.caption.copyWith(
                color: AppColors.primaryStrong,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        if (themeMatchLabel != null) ...[
          const SizedBox(height: AppSpacing.xs),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xxs,
            ),
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(AppRadius.pill),
              border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.32),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.auto_awesome_rounded,
                  size: 14,
                  color: AppColors.primary,
                ),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    themeMatchLabel!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.caption.copyWith(
                      color: AppColors.primaryStrong,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.sm),
        _ProviderRating(provider: provider),
        const SizedBox(height: AppSpacing.sm),
        FeastaPriceText(
          amount: provider.minPrice,
          decimalDigits: 0,
          semanticLabel:
              'Starting price '
              '${FeastaPriceFormatter.format(provider.minPrice, decimalDigits: 0)}',
          style: AppTypography.label.copyWith(
            color: AppColors.primaryStrong,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 1),
              child: Icon(
                Icons.location_on_outlined,
                color: AppColors.secondaryTextAccessible,
                size: AppSizes.iconSmall,
              ),
            ),
            const SizedBox(width: AppSpacing.xxs),
            Expanded(
              child: Text(
                provider.location,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.caption.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ProviderRating extends StatelessWidget {
  const _ProviderRating({required this.provider});

  final ProviderModel provider;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(
          Icons.star_rounded,
          color: Colors.amber,
          size: AppSizes.iconSmall,
        ),
        const SizedBox(width: AppSpacing.xxs),
        Text(
          provider.ratingAverage.toStringAsFixed(1),
          style: AppTypography.caption.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(width: AppSpacing.xxs),
        Flexible(
          child: Text(
            '(${provider.reviewCount})',
            style: AppTypography.caption.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ),
      ],
    );
  }
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

String _themeMatchLabel(ProviderModel provider, Set<String> selectedThemes) {
  final searchable = normalizeThemeText(
    '${provider.businessName} '
    '${provider.description} '
    '${provider.providerCategory} '
    '${provider.eventTypesSupported.join(' ')}',
  );

  for (final theme in selectedThemes) {
    if (theme == 'Custom theme' || theme == 'Not sure yet') {
      continue;
    }

    if (searchable.contains(normalizeThemeText(theme))) {
      return '$theme theme match';
    }
  }

  return 'Theme match';
}

void _openProvider(BuildContext context, ProviderModel provider) {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => ProviderProfileScreen(provider: provider),
    ),
  );
}
